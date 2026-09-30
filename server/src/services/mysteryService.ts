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

import { col, newId, registerIndexes } from '../db/mongo.js';
import { isValidWord } from '../game/words.js';
import { containsProfanity } from '../moderation/blocklist.js';
import { logger } from '../utils/logger.js';

registerIndexes('mystery_submissions', [
    { key: { id: 1 }, unique: true },
    { key: { available: 1, word_length: 1, created_at: 1 } },
    { key: { user_id: 1, available: 1 } },
]);

export interface MysterySubmission {
    id: string;
    word: string;
    wordLength: number;
    available: boolean;
    createdAt: string;
}

interface SubmissionDoc {
    id: string;
    user_id: string;
    word: string;
    word_length: number;
    available: boolean;
    created_at: Date;
    consumed_at: Date | null;
}

const submissions = () => col<SubmissionDoc>('mystery_submissions');

function toApi(r: SubmissionDoc): MysterySubmission {
    return {
        id: r.id,
        word: r.word,
        wordLength: r.word_length,
        available: r.available,
        createdAt: r.created_at.toISOString(),
    };
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
    const existing = await submissions().findOne(
        { user_id: userId, available: true },
        { projection: { _id: 1 } }
    );
    if (existing) {
        return {
            ok: false,
            error: "You already have a pending mystery word. Wait for it to be matched.",
        };
    }

    const doc: SubmissionDoc = {
        id: newId(),
        user_id: userId,
        word: w,
        word_length: w.length,
        available: true,
        created_at: new Date(),
        consumed_at: null,
    };
    await submissions().insertOne(doc);
    return { ok: true, submission: toApi(doc) };
}

/** Get this user's current pending submission (one max, see submitWord). */
export async function getMyPendingSubmission(
    userId: string
): Promise<MysterySubmission | null> {
    const r = await submissions().findOne(
        { user_id: userId, available: true },
        { sort: { created_at: -1 } }
    );
    return r ? toApi(r) : null;
}

/** Withdraw a pending submission. */
export async function withdrawSubmission(userId: string): Promise<void> {
    await submissions().updateMany(
        { user_id: userId, available: true },
        { $set: { available: false, consumed_at: new Date() } }
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
 * Concurrency: each submission is claimed with an atomic
 * findOneAndUpdate on `available: true`, so two concurrent ticks can never
 * consume the same row (the old SELECT ... FOR UPDATE SKIP LOCKED).
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
    const mine = await submissions().findOne(
        { user_id: userId, available: true },
        { sort: { created_at: -1 }, projection: { id: 1, word: 1, word_length: 1 } }
    );
    if (!mine) return { matched: false };

    // Claim someone else's same-length submission. When an eligible set is
    // supplied, only pair with those (co-located) players.
    const restrictToLocal =
        eligibleOpponentIds != null && eligibleOpponentIds.length > 0;
    const consumed = { $set: { available: false, consumed_at: new Date() } };
    const opponent = await submissions().findOneAndUpdate(
        {
            available: true,
            user_id: restrictToLocal ? { $ne: userId, $in: eligibleOpponentIds } : { $ne: userId },
            word_length: mine.word_length,
        },
        consumed,
        { sort: { created_at: 1 }, returnDocument: 'after' }
    );
    if (!opponent) return { matched: false };

    // Now claim mine. If it vanished in between (withdrawn / consumed by a
    // concurrent matcher), hand the opponent back to the pool.
    const claimedMine = await submissions().updateOne({ id: mine.id, available: true }, consumed);
    if (claimedMine.modifiedCount === 0) {
        await submissions().updateOne({ id: opponent.id }, { $set: { available: true, consumed_at: null } });
        return { matched: false };
    }

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
}
