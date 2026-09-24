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
import { scoreGuess, validateGuess, type GuessResult } from '../game/engine.js';
import { redeemHint, type HintResult, type HintError } from './hintService.js';
import { grantCoins } from './coinsService.js';
import { logger } from '../utils/logger.js';

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
        coins_awarded: number;
    }>(
        `SELECT guesses, solved, guess_count, duration_ms, created_at, coins_awarded
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
        coinsAwarded: r.coins_awarded,
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

    // The WHERE guard makes a racing second solve a no-op (no row returned),
    // so the coin grant below can only happen once per day.
    const written = await query<{ solved: boolean }>(
        `INSERT INTO daily_challenge_attempts
            (challenge_date, user_id, guesses, solved, guess_count, duration_ms, created_at, coins_awarded)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, to_timestamp($7 / 1000.0), $8)
         ON CONFLICT (challenge_date, user_id) DO UPDATE SET
            guesses = EXCLUDED.guesses,
            solved = EXCLUDED.solved,
            guess_count = EXCLUDED.guess_count,
            duration_ms = EXCLUDED.duration_ms,
            coins_awarded = EXCLUDED.coins_awarded
         WHERE daily_challenge_attempts.solved = FALSE
         RETURNING solved`,
        [
            date,
            userId,
            JSON.stringify(newGuesses),
            solved,
            newGuesses.length,
            durationMs,
            startedAt,
            solved ? DAILY_SOLVE_COINS : 0,
        ]
    );
    if (!written[0]) {
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
            await query(
                'UPDATE daily_challenge_attempts SET coins_awarded = 0 WHERE challenge_date = $1 AND user_id = $2',
                [date, userId]
            ).catch(() => {});
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
    const rows = await query<{ position: number; letter: string }>(
        `SELECT position, letter FROM hint_uses
         WHERE match_id = $1 AND user_id = $2
         ORDER BY used_at ASC`,
        [dailyHintKey(date), userId]
    );
    return {
        hintsUsed: rows.length,
        hintCap: dailyHintCap(challenge.wordLength),
        hints: rows,
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
