// Daily challenge mode.
//
// One word per UTC day, picked at first-access for that day (lazy generation
// so we don't need a cron job). Async, no timer — just guess count.
// Players have unlimited tries until they solve or give up.
//
// Why UTC and not local time: with a worldwide playerbase, a "today's
// challenge" needs ONE shared answer. Local-time per-player would mean
// the leaderboard mixes different words. UTC is the simplest fair choice;
// the client can show "fresh in X hours" in local time.

import { persistedDailySolvers } from './syntheticHistory.js';
import { col, registerIndexes } from '../db/mongo.js';
import { isValidWord, pickRandomWord } from '../game/words.js';
import { scoreGuess, validateGuess, type GuessResult } from '../game/engine.js';
import { redeemHint, type HintResult, type HintError } from './hintService.js';
import { grantCoins } from './coinsService.js';
import { logger } from '../utils/logger.js';

registerIndexes('daily_challenges', [{ key: { challenge_date: 1 }, unique: true }]);
registerIndexes('daily_challenge_attempts', [
    { key: { challenge_date: 1, user_id: 1 }, unique: true },
    { key: { challenge_date: 1, solved: 1 } },
]);
registerIndexes('hint_uses', [{ key: { match_id: 1, user_id: 1 } }]);

/** Coins for solving the day's word. Once per day; a hint costs 50. */
export const DAILY_SOLVE_COINS = 15;

export interface DailyChallenge {
    challengeDate: string; // YYYY-MM-DD
    wordLength: number;
}

export interface DailyAttempt {
    guesses: { guess: string; tiles: ('correct' | 'misplaced' | 'wrong')[] }[];
    solved: boolean;
    guessCount: number;
    durationMs: number;
    startedAt: number;
    coinsAwarded: number;
}

interface AttemptDoc {
    challenge_date: string;
    user_id: string;
    guesses: DailyAttempt['guesses'];
    solved: boolean;
    guess_count: number;
    duration_ms: number;
    created_at: Date;
    coins_awarded: number;
}

/**
 * Today's UTC date in YYYY-MM-DD. Used everywhere as the challenge key.
 */
function todayUtc(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate()
    ).padStart(2, '0')}`;
}

/**
 * Get (or lazily create) today's daily challenge. Length cycles through
 * 4-8 deterministically by day-of-year so players see variety. We don't go
 * higher than 8 here — daily mode is meant to be approachable.
 */
export async function getOrCreateTodaysChallenge(): Promise<DailyChallenge> {
    const date = todayUtc();
    const row = await col<{ challenge_date: string; word_length: number }>('daily_challenges').findOne(
        { challenge_date: date },
        { projection: { _id: 0, word_length: 1 } }
    );
    if (row) {
        return { challengeDate: date, wordLength: row.word_length };
    }
    // Pick length cyclically by day-of-year.
    const dayOfYear = Math.floor(
        (Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86_400_000
    );
    const lengthOptions = [5, 6, 5, 7, 6, 8, 5, 7, 6, 8]; // mostly 5-7, occasional 8
    const length = lengthOptions[dayOfYear % lengthOptions.length]!;
    const word = pickRandomWord(length);
    await col('daily_challenges').updateOne(
        { challenge_date: date },
        { $setOnInsert: { challenge_date: date, word, word_length: length, created_at: new Date() } },
        { upsert: true }
    );
    return { challengeDate: date, wordLength: length };
}

/** Internal: fetch the word for a given date. NEVER expose to client. */
async function getWord(date: string): Promise<string | null> {
    const row = await col<{ word: string }>('daily_challenges').findOne(
        { challenge_date: date },
        { projection: { _id: 0, word: 1 } }
    );
    return row?.word ?? null;
}

/**
 * Get the player's attempt for today. Returns null if they haven't started.
 */
export async function getMyAttempt(userId: string): Promise<DailyAttempt | null> {
    const date = todayUtc();
    const r = await col<AttemptDoc>('daily_challenge_attempts').findOne(
        { challenge_date: date, user_id: userId },
        { projection: { _id: 0 } }
    );
    if (!r) return null;
    return {
        guesses: r.guesses,
        solved: r.solved,
        guessCount: r.guess_count,
        durationMs: r.duration_ms,
        startedAt: new Date(r.created_at).getTime(),
        coinsAwarded: r.coins_awarded ?? 0,
    };
}

/**
 * Start today's clock the first time the player opens the challenge, so solve
 * time includes thinking before the first guess (otherwise a one-guess solve
 * would read 0 s). No-op once an attempt exists.
 */
export async function ensureAttemptStarted(userId: string): Promise<void> {
    const date = todayUtc();
    await col<AttemptDoc>('daily_challenge_attempts').updateOne(
        { challenge_date: date, user_id: userId },
        {
            $setOnInsert: {
                challenge_date: date,
                user_id: userId,
                guesses: [],
                solved: false,
                guess_count: 0,
                duration_ms: 0,
                created_at: new Date(),
                coins_awarded: 0,
            },
        },
        { upsert: true }
    );
}

/**
 * Submit a guess. Validates against the word bank + the actual answer for
 * tile colors. Already-solved attempts are immutable.
 */
export async function submitGuess(
    userId: string,
    guess: string
): Promise<
    | {
          ok: true;
          tiles: ('correct' | 'misplaced' | 'wrong')[];
          solved: boolean;
          guessCount: number;
          coinsAwarded: number;
      }
    | { ok: false; error: string; errorCode: string }
> {
    const date = todayUtc();
    const word = await getWord(date);
    if (!word) return { ok: false, error: 'No challenge today', errorCode: 'NO_CHALLENGE' };

    const v = validateGuess(guess, word.length, isValidWord);
    if (v) return { ok: false, error: v.message, errorCode: v.code };

    const result = scoreGuess(guess.toUpperCase(), word);
    const tiles = result.tiles;
    const solved = result.solved;

    // Upsert with the new guess appended.
    const existing = await getMyAttempt(userId);
    const startedAt = existing?.startedAt ?? Date.now();
    if (existing?.solved) {
        return {
            ok: false,
            error: "You've already solved today's challenge.",
            errorCode: 'ALREADY_SOLVED',
        };
    }
    const newGuesses = [
        ...(existing?.guesses ?? []),
        { guess: guess.toUpperCase(), tiles },
    ];
    const durationMs = solved ? Date.now() - startedAt : existing?.durationMs ?? 0;

    // The `solved: false` filter makes a racing second solve a no-op: the
    // upsert then tries to insert a duplicate (challenge_date, user_id) and
    // fails with 11000, so the coin grant below can only happen once per day.
    const attempts = col<AttemptDoc>('daily_challenge_attempts');
    try {
        await attempts.updateOne(
            { challenge_date: date, user_id: userId, solved: false },
            {
                $set: {
                    guesses: newGuesses,
                    solved,
                    guess_count: newGuesses.length,
                    duration_ms: durationMs,
                    coins_awarded: solved ? DAILY_SOLVE_COINS : 0,
                },
                $setOnInsert: { challenge_date: date, user_id: userId, created_at: new Date(startedAt) },
            },
            { upsert: true }
        );
    } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
        return {
            ok: false,
            error: "You've already solved today's challenge.",
            errorCode: 'ALREADY_SOLVED',
        };
    }

    let coinsAwarded = 0;
    if (solved) {
        try {
            await grantCoins({ userId, amount: DAILY_SOLVE_COINS, source: 'daily_solve', metadata: { date } });
            coinsAwarded = DAILY_SOLVE_COINS;
        } catch (err) {
            logger.error({ err, userId, date }, 'daily solve coin grant failed');
            await attempts
                .updateOne({ challenge_date: date, user_id: userId }, { $set: { coins_awarded: 0 } })
                .catch(() => {});
        }
    }

    return { ok: true, tiles, solved, guessCount: newGuesses.length, coinsAwarded };
}

// ─── Hints ──────────────────────────────────────────────────────────────────
//
// Same rules as live matches: word-length-aware cap (1 hint for 4-7 letter
// words, 2 for 8+), paid via the shared waterfall (first-ever free → hint
// credits → 50 coins). Audited in hint_uses under a synthetic
// 'daily:YYYY-MM-DD' key so reveals survive app restarts.

function dailyHintKey(date: string): string {
    return `daily:${date}`;
}

export function dailyHintCap(wordLength: number): number {
    return wordLength >= 8 ? 2 : 1;
}

export interface DailyHintState {
    hintsUsed: number;
    hintCap: number;
    /** Already-revealed positions, so the client can re-render them after
     *  an app restart. */
    hints: { position: number; letter: string }[];
}

export async function getMyDailyHints(userId: string): Promise<DailyHintState> {
    const date = todayUtc();
    const challenge = await getOrCreateTodaysChallenge();
    const rows = await col<{ position: number; letter: string }>('hint_uses')
        .find({ match_id: dailyHintKey(date), user_id: userId }, { projection: { _id: 0, position: 1, letter: 1 }, sort: { used_at: 1 } })
        .toArray();
    return {
        hintsUsed: rows.length,
        hintCap: dailyHintCap(challenge.wordLength),
        hints: rows.map((r) => ({ position: r.position, letter: r.letter })),
    };
}

export async function redeemDailyHint(
    userId: string
): Promise<HintResult | HintError | { ok: false; error: 'PER_MATCH_LIMIT' | 'ALREADY_SOLVED' | 'NO_CHALLENGE' }> {
    const date = todayUtc();
    const word = await getWord(date);
    if (!word) return { ok: false, error: 'NO_CHALLENGE' };

    const attempt = await getMyAttempt(userId);
    if (attempt?.solved) return { ok: false, error: 'ALREADY_SOLVED' };

    const state = await getMyDailyHints(userId);
    if (state.hintsUsed >= state.hintCap) {
        return { ok: false, error: 'PER_MATCH_LIMIT' };
    }

    // Feed the attempt's guesses in as history so we never reveal a
    // position the player has already greened. Also exclude positions
    // revealed by a previous daily hint (redeemHint only knows greens).
    const history: GuessResult[] = (attempt?.guesses ?? []).map((g) => ({
        guess: g.guess,
        tiles: g.tiles,
        solved: g.tiles.every((t) => t === 'correct'),
    }));
    for (const h of state.hints) {
        // Synthesize a "green at revealed position" row so pickHintPosition
        // skips it. Tiles elsewhere marked wrong — harmless for picking.
        const tiles = new Array(word.length).fill('wrong') as GuessResult['tiles'];
        tiles[h.position] = 'correct';
        history.push({ guess: word, tiles, solved: false });
    }

    return redeemHint({
        userId,
        matchId: dailyHintKey(date),
        target: word,
        history,
    });
}

/**
 * Daily challenge leaderboard for today: recorded and seeded solves, ranked by
 * guess count then time. Also returns the
 * caller's own rank so the client can show it when they're outside the top.
 */
export async function todaysLeaderboard(
    limit = 50,
    userId?: string
): Promise<{
    entries: { userId: string; username: string; guessCount: number; durationMs: number }[];
    me: { rank: number; guessCount: number; durationMs: number } | null;
    total: number;
}> {
    const date = todayUtc();
    // ponytail: merges every real solver in memory; move ranking into the DB
    // once daily solvers reach the tens of thousands.
    const rows = await col<AttemptDoc>('daily_challenge_attempts')
        .aggregate<{ user_id: string; username: string; guess_count: number; duration_ms: number }>([
            { $match: { challenge_date: date, solved: true } },
            { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'u' } },
            { $unwind: '$u' },
            { $match: { 'u.auth_subject': { $not: /^bot-/ }, 'u.banned': false } },
            { $project: { _id: 0, user_id: 1, guess_count: 1, duration_ms: 1, username: '$u.username' } },
        ])
        .toArray();
    const all = [
        ...rows.map((r) => ({
            userId: r.user_id,
            username: r.username,
            guessCount: r.guess_count,
            durationMs: r.duration_ms,
        })),
        ...(await persistedDailySolvers(date)).map(({ userId, username, guessCount, durationMs }) => ({ userId, username, guessCount, durationMs })),
    ].sort((a, b) => a.guessCount - b.guessCount || a.durationMs - b.durationMs || a.userId.localeCompare(b.userId));

    const idx = userId ? all.findIndex((e) => e.userId === userId) : -1;
    const mine = idx >= 0 ? all[idx]! : null;
    return {
        entries: all.slice(0, limit),
        me: mine ? { rank: idx + 1, guessCount: mine.guessCount, durationMs: mine.durationMs } : null,
        total: all.length,
    };
}
