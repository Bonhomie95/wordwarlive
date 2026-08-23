// Mystery mode.
//
// A separate game mode where players submit their own words and try to
// crack each other's. The competitive fairness is preserved by matching
// players who submitted words of the same length.
//
// Flow:
//   1. Player A submits "BOULDER" (7 letters). Server pool gets the entry.
//   2. Player B submits "FOREST" (6 letters).  Different length — won't
//      match A; goes into the pool for 6-letter mystery players.
//   3. Player C submits "PYTHON" (6 letters). Matches B. Server picks
//      either one's word as the answer (random) and creates the match.
//      Both submissions are marked consumed.
//   4. Both players guess the answer using normal Wordle mechanics.
//
// Validation: word must be (a) a real English word in our bank, (b) not
// a slur or profanity. We rely on the existing word_bank for (a) and a
// small blocklist for (b).

import { pool, query } from '../db/pool.js';
import { isValidWord } from '../game/words.js';
import { containsProfanity } from '../moderation/blocklist.js';
import { logger } from '../utils/logger.js';

export interface MysterySubmission {
    id: string;
    word: string;
    wordLength: number;
    available: boolean;
    createdAt: string;
}

export async function submitWord(
    userId: string,
    word: string
): Promise<{ ok: true; submission: MysterySubmission } | { ok: false; error: string }> {
    const w = word.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(w)) return { ok: false, error: 'Letters only.' };
    if (w.length < 4 || w.length > 10)
        return { ok: false, error: 'Word must be 4-10 letters.' };
    if (!isValidWord(w))
        return { ok: false, error: 'Not in our word list.' };
    // Shared moderation backstop (leetspeak-folded slur/profanity check) on
    // top of the curated word bank.
    if (containsProfanity(w)) return { ok: false, error: 'Word not allowed.' };

    // Cap one available submission per user — otherwise they could spam
    // the pool with their own words to match themselves.
    const existing = await query<{ id: string }>(
        'SELECT id FROM mystery_submissions WHERE user_id = $1 AND available = TRUE',
        [userId]
    );
    if (existing.length > 0) {
        return {
            ok: false,
            error: "You already have a pending mystery word. Wait for it to be matched.",
        };
    }

    const rows = await query<{
        id: string;
        word: string;
        word_length: number;
        available: boolean;
        created_at: Date;
    }>(
        `INSERT INTO mystery_submissions(user_id, word, word_length)
         VALUES ($1, $2, $3)
         RETURNING id, word, word_length, available, created_at`,
        [userId, w, w.length]
    );
    const r = rows[0]!;
    return {
        ok: true,
        submission: {
            id: r.id,
            word: r.word,
            wordLength: r.word_length,
            available: r.available,
            createdAt: r.created_at.toISOString(),
        },
    };
}

/** Get this user's current pending submission (one max, see submitWord). */
export async function getMyPendingSubmission(
    userId: string
): Promise<MysterySubmission | null> {
    const rows = await query<{
        id: string;
        word: string;
        word_length: number;
        available: boolean;
        created_at: Date;
    }>(
        `SELECT id, word, word_length, available, created_at
         FROM mystery_submissions
         WHERE user_id = $1 AND available = TRUE
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
    );
    const r = rows[0];
    if (!r) return null;
    return {
        id: r.id,
        word: r.word,
        wordLength: r.word_length,
        available: r.available,
        createdAt: r.created_at.toISOString(),
    };
}

/** Withdraw a pending submission. */
export async function withdrawSubmission(userId: string): Promise<void> {
    await query(
        `UPDATE mystery_submissions
         SET available = FALSE, consumed_at = now()
         WHERE user_id = $1 AND available = TRUE`,
        [userId]
    );
}

/**
 * Find an opponent for the given user: another player with a pending
 * submission of the same length, not the same user. Marks both as
 * consumed and returns the pair + both words.
 *
 * Each player races the OPPONENT's word. Nobody ever plays a word they
 * submitted themselves — that would be a guaranteed first-guess win for
 * the submitter. Lengths always match, so the race stays fair.
 *
 * The SELECT ... FOR UPDATE SKIP LOCKED and the consuming UPDATE run in a
 * single transaction — outside one, the row lock releases the moment the
 * SELECT returns and two concurrent ticks can claim the same opponent.
 */
export async function tryMatch(
    userId: string,
    /** Restrict pairing to these user ids (the callers' live, same-node queue).
     *  Guarantees the two players are co-located on one instance — the match
     *  runtime is node-local. If omitted/empty, any same-length opponent is
     *  eligible (single-node behavior). Without this, a cross-node pairing
     *  would consume BOTH submissions in the DB but fail to start a match. */
    eligibleOpponentIds?: string[]
): Promise<{
    matched: true;
    opponentUserId: string;
    /** The requesting user's target = the opponent's submission. */
    myWord: string;
    /** The opponent's target = the requesting user's submission. */
    opponentWord: string;
    wordLength: number;
} | { matched: false }> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock MY submission first so a concurrent matcher can't consume it
        // out from under us mid-pairing.
        const mineRes = await client.query<{ id: string; word: string; word_length: number }>(
            `SELECT id, word, word_length
             FROM mystery_submissions
             WHERE user_id = $1 AND available = TRUE
             ORDER BY created_at DESC
             LIMIT 1
             FOR UPDATE SKIP LOCKED`,
            [userId]
        );
        const mine = mineRes.rows[0];
        if (!mine) {
            await client.query('ROLLBACK');
            return { matched: false };
        }

        // Find + lock someone else's same-length submission. When an eligible
        // set is supplied, only pair with those (co-located) players.
        const restrictToLocal =
            eligibleOpponentIds != null && eligibleOpponentIds.length > 0;
        const oppRes = await client.query<{ id: string; user_id: string; word: string }>(
            `SELECT id, user_id, word
             FROM mystery_submissions
             WHERE available = TRUE AND user_id <> $1 AND word_length = $2
               ${restrictToLocal ? 'AND user_id = ANY($3::uuid[])' : ''}
             ORDER BY created_at ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED`,
            restrictToLocal
                ? [userId, mine.word_length, eligibleOpponentIds]
                : [userId, mine.word_length]
        );
        const opponent = oppRes.rows[0];
        if (!opponent) {
            await client.query('ROLLBACK');
            return { matched: false };
        }

        await client.query(
            `UPDATE mystery_submissions
             SET available = FALSE, consumed_at = now()
             WHERE id IN ($1::uuid, $2::uuid)`,
            [mine.id, opponent.id]
        );
        await client.query('COMMIT');

        logger.info(
            { userId, opponentUserId: opponent.user_id, wordLength: mine.word_length },
            'mystery match made'
        );

        return {
            matched: true,
            opponentUserId: opponent.user_id,
            myWord: opponent.word,
            opponentWord: mine.word,
            wordLength: mine.word_length,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
