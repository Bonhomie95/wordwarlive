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

import { query } from '../db/pool.js';
import { isValidWord, pickRandomWord } from '../game/words.js';
import { scoreGuess, validateGuess } from '../game/engine.js';

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
    const rows = await query<{ challenge_date: Date; word_length: number }>(
        'SELECT challenge_date, word_length FROM daily_challenges WHERE challenge_date = $1',
        [date]
    );
    if (rows[0]) {
        return { challengeDate: date, wordLength: rows[0].word_length };
    }
    // Pick length cyclically by day-of-year.
    const dayOfYear = Math.floor(
        (Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86_400_000
    );
    const lengthOptions = [5, 6, 5, 7, 6, 8, 5, 7, 6, 8]; // mostly 5-7, occasional 8
    const length = lengthOptions[dayOfYear % lengthOptions.length]!;
    const word = pickRandomWord(length);
    await query(
        `INSERT INTO daily_challenges(challenge_date, word, word_length)
         VALUES ($1, $2, $3)
         ON CONFLICT (challenge_date) DO NOTHING`,
        [date, word, length]
    );
    return { challengeDate: date, wordLength: length };
}

/** Internal: fetch the word for a given date. NEVER expose to client. */
async function getWord(date: string): Promise<string | null> {
    const rows = await query<{ word: string }>(
        'SELECT word FROM daily_challenges WHERE challenge_date = $1',
        [date]
    );
    return rows[0]?.word ?? null;
}

/**
 * Get the player's attempt for today. Returns null if they haven't started.
 */
export async function getMyAttempt(userId: string): Promise<DailyAttempt | null> {
    const date = todayUtc();
    const rows = await query<{
        guesses: DailyAttempt['guesses'];
        solved: boolean;
        guess_count: number;
        duration_ms: number;
        created_at: Date;
    }>(
        `SELECT guesses, solved, guess_count, duration_ms, created_at
         FROM daily_challenge_attempts
         WHERE challenge_date = $1 AND user_id = $2`,
        [date, userId]
    );
    const r = rows[0];
    if (!r) return null;
    return {
        guesses: r.guesses,
        solved: r.solved,
        guessCount: r.guess_count,
        durationMs: r.duration_ms,
        startedAt: new Date(r.created_at).getTime(),
    };
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

    await query(
        `INSERT INTO daily_challenge_attempts
            (challenge_date, user_id, guesses, solved, guess_count, duration_ms, created_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, to_timestamp($7 / 1000.0))
         ON CONFLICT (challenge_date, user_id) DO UPDATE SET
            guesses = EXCLUDED.guesses,
            solved = EXCLUDED.solved,
            guess_count = EXCLUDED.guess_count,
            duration_ms = EXCLUDED.duration_ms`,
        [
            date,
            userId,
            JSON.stringify(newGuesses),
            solved,
            newGuesses.length,
            durationMs,
            startedAt,
        ]
    );

    return { ok: true, tiles, solved, guessCount: newGuesses.length };
}

/**
 * Daily challenge leaderboard for today. Solvers ranked by guess count, then
 * by duration. Unsolved attempts excluded.
 */
export async function todaysLeaderboard(limit = 50): Promise<
    {
        userId: string;
        username: string;
        guessCount: number;
        durationMs: number;
    }[]
> {
    const date = todayUtc();
    const rows = await query<{
        user_id: string;
        username: string;
        guess_count: number;
        duration_ms: number;
    }>(
        `SELECT a.user_id, u.username, a.guess_count, a.duration_ms
         FROM daily_challenge_attempts a
         JOIN users u ON u.id = a.user_id
         WHERE a.challenge_date = $1 AND a.solved = TRUE
           AND u.auth_subject NOT LIKE 'bot-%'
         ORDER BY a.guess_count ASC, a.duration_ms ASC
         LIMIT $2`,
        [date, limit]
    );
    return rows.map((r) => ({
        userId: r.user_id,
        username: r.username,
        guessCount: r.guess_count,
        durationMs: r.duration_ms,
    }));
}
