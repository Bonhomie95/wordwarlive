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

import { query } from '../db/pool.js';
import { isValidWord } from '../game/words.js';
import { logger } from '../utils/logger.js';

// Minimal profanity blocklist. Not exhaustive — players can also report
// inappropriate matches in-app. The word_bank itself was curated to skip
// vulgar words, so this catches edge cases.
const BLOCKLIST = new Set<string>([
    // Add explicit blocks here. Intentionally short; relies on word_bank's
    // own curation. Examples: ['CRAP', 'HELL'] — start conservative.
]);

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
    if (BLOCKLIST.has(w)) return { ok: false, error: 'Word not allowed.' };

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
 * consumed and returns the pair + chosen word.
 *
 * The chosen word is randomly one of the two submissions — both players
 * play against the SAME word. This keeps the comparison fair (same word,
 * different solver speeds).
 */
export async function tryMatch(userId: string): Promise<{
    matched: true;
    opponentUserId: string;
    word: string;
    wordLength: number;
} | { matched: false }> {
    // Find my submission.
    const mine = await getMyPendingSubmission(userId);
    if (!mine) return { matched: false };

    // Find someone else's same-length submission.
    const candidates = await query<{
        id: string;
        user_id: string;
        word: string;
    }>(
        `SELECT id, user_id, word
         FROM mystery_submissions
         WHERE available = TRUE AND user_id <> $1 AND word_length = $2
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [userId, mine.wordLength]
    );
    const opponent = candidates[0];
    if (!opponent) return { matched: false };

    // Pick which word is the answer — random.
    const chosenWord = Math.random() < 0.5 ? mine.word : opponent.word;

    // Mark both consumed in one statement so a concurrent matcher can't
    // grab the same opponent.
    await query(
        `UPDATE mystery_submissions
         SET available = FALSE, consumed_at = now()
         WHERE id IN ($1::uuid, $2::uuid)`,
        [mine.id, opponent.id]
    );

    logger.info(
        { userId, opponentUserId: opponent.user_id, wordLength: mine.wordLength },
        'mystery match made'
    );

    return {
        matched: true,
        opponentUserId: opponent.user_id,
        word: chosenWord,
        wordLength: mine.wordLength,
    };
}
