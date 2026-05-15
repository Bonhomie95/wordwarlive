// Daily play-streak tracking. Advanced ONLY when a match COMPLETES (not on
// app open, not on connect). Compares the current UTC date against the
// stored last_play_date.
//
// State transitions:
//   last NULL          → streak = 1 (first ever play)
//   last == today UTC  → no-op (already counted today)
//   last == yesterday  → streak += 1
//   last <  yesterday  → streak = 1 (broken, restart)

import { pool } from '../db/pool.js';
import { grantCoins, grantHintCredits } from './coinsService.js';

const DAILY_COIN_REWARD = 10;

export interface Milestone {
    day: number;
    coins: number;
    hintCredits: number;
}

/** Reward thresholds. Hit when play_streak BECOMES this number. */
export const MILESTONES: readonly Milestone[] = [
    { day: 5, coins: 50, hintCredits: 1 },
    { day: 10, coins: 100, hintCredits: 2 },
    { day: 25, coins: 250, hintCredits: 5 },
    { day: 50, coins: 500, hintCredits: 10 },
    { day: 100, coins: 1000, hintCredits: 20 },
] as const;

export interface StreakUpdate {
    /** New play_streak value (after the update). */
    playStreak: number;
    /** True if this match advanced the streak to a new day. */
    advanced: boolean;
    /** Coins granted for the daily login (only if advanced). */
    dailyCoins: number;
    /** Milestone the user hit on this match, or null. */
    milestone: Milestone | null;
}

function todayUtcDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

function yesterdayUtcDateString(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

/**
 * Called when a match COMPLETES. Idempotent within a single UTC day.
 * Returns the streak update info for surface in the match_over payload.
 */
export async function advanceStreakOnMatchComplete(
    userId: string
): Promise<StreakUpdate> {
    const today = todayUtcDateString();
    const yesterday = yesterdayUtcDateString();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query<{
            play_streak: number;
            play_streak_best: number;
            last_play_date: string | null;
        }>(
            `SELECT play_streak, play_streak_best,
                    to_char(last_play_date, 'YYYY-MM-DD') AS last_play_date
             FROM users WHERE id = $1 FOR UPDATE`,
            [userId]
        );
        const u = r.rows[0];
        if (!u) {
            await client.query('ROLLBACK');
            return { playStreak: 0, advanced: false, dailyCoins: 0, milestone: null };
        }

        // Already counted today.
        if (u.last_play_date === today) {
            await client.query('COMMIT');
            return {
                playStreak: u.play_streak,
                advanced: false,
                dailyCoins: 0,
                milestone: null,
            };
        }

        const newStreak = u.last_play_date === yesterday ? u.play_streak + 1 : 1;
        const newBest = Math.max(u.play_streak_best, newStreak);
        await client.query(
            `UPDATE users SET play_streak = $1, play_streak_best = $2,
                              last_play_date = $3::date, updated_at = now()
             WHERE id = $4`,
            [newStreak, newBest, today, userId]
        );
        await client.query('COMMIT');

        // Grant the daily reward + check for milestone. Done outside the
        // transaction so coin_grants stamps land in coinsService's own
        // transactions (they're idempotent on amount = grant log, not on
        // streak day, so a retry would double-count — but we already
        // committed the streak advance above, so retries can't reach here).
        await grantCoins({
            userId,
            amount: DAILY_COIN_REWARD,
            source: 'streak_daily',
            metadata: { day: newStreak },
        });

        const milestone = MILESTONES.find((m) => m.day === newStreak) ?? null;
        if (milestone) {
            await grantCoins({
                userId,
                amount: milestone.coins,
                source: 'streak_milestone',
                metadata: { day: newStreak },
            });
            if (milestone.hintCredits > 0) {
                await grantHintCredits(userId, milestone.hintCredits);
            }
        }

        return {
            playStreak: newStreak,
            advanced: true,
            dailyCoins: DAILY_COIN_REWARD,
            milestone,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/** Compute the next milestone the user is working toward. */
export function nextMilestone(playStreak: number): Milestone | null {
    return MILESTONES.find((m) => m.day > playStreak) ?? null;
}

/**
 * Compute the player's *effective* current streak — what we should display
 * right now, before they've played a match today.
 *
 * The stored play_streak only updates when a match completes. If the player
 * missed yesterday entirely and opens the app today, the stored value is
 * stale. This function looks at last_play_date and returns:
 *
 *   - last == today UTC      → stored streak (they already played today)
 *   - last == yesterday UTC  → stored streak (still alive — they need to
 *                              play today to extend, but it hasn't broken)
 *   - last < yesterday UTC   → 0 (streak has lapsed; will reset to 1 on
 *                              their next match)
 *   - last NULL              → 0 (never played)
 *
 * Pure function on (storedStreak, lastPlayDate). Easy to unit-test if we
 * want to.
 */
export function effectiveStreak(
    storedStreak: number,
    lastPlayDate: Date | string | null
): number {
    if (!lastPlayDate) return 0;
    const today = todayUtcDateString();
    const yesterday = yesterdayUtcDateString();
    const lastStr =
        lastPlayDate instanceof Date
            ? lastPlayDate.toISOString().slice(0, 10)
            : String(lastPlayDate).slice(0, 10);
    if (lastStr === today || lastStr === yesterday) return storedStreak;
    return 0;
}
