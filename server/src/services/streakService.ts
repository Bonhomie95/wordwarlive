// Daily play-streak tracking. Advanced ONLY when a match COMPLETES (not on
// app open, not on connect). Compares the current UTC date against the
// stored last_play_date.
//
// State transitions:
//   last NULL          → streak = 1 (first ever play)
//   last == today UTC  → no-op (already counted today)
//   last == yesterday  → streak += 1
//   last <  yesterday  → streak = 1 (broken, restart)

import { col } from '../db/mongo.js';
import { grantCoins } from './coinsService.js';

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
    /** Streak Shields consumed to bridge missed days (0 when none). */
    shieldsUsed: number;
}

/** Whole days between two YYYY-MM-DD strings (b - a). */
function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Pure streak transition. A Streak Shield covers exactly one missed day, so a
 * player with N shields who missed N (or fewer) days keeps their streak and
 * burns that many shields. Missing more days than shields held breaks it.
 */
export function nextStreak(args: {
    lastPlayDate: string | null;
    today: string;
    streak: number;
    shields: number;
}): { streak: number; shieldsUsed: number } {
    if (!args.lastPlayDate) return { streak: 1, shieldsUsed: 0 };
    const gap = daysBetween(args.lastPlayDate, args.today); // 1 = played yesterday
    if (gap <= 1) return { streak: args.streak + 1, shieldsUsed: 0 };
    const missed = gap - 1;
    if (missed <= args.shields) return { streak: args.streak + 1, shieldsUsed: missed };
    return { streak: 1, shieldsUsed: 0 };
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

    const users = col<{
        play_streak: number;
        play_streak_best: number;
        last_play_date: string | Date | null;
        streak_shields: number;
    }>('users');
    const u = await users.findOne(
        { id: userId },
        { projection: { _id: 0, play_streak: 1, play_streak_best: 1, last_play_date: 1, streak_shields: 1 } }
    );
    if (!u) {
        return { playStreak: 0, advanced: false, dailyCoins: 0, milestone: null, shieldsUsed: 0 };
    }
    const lastPlayDate = u.last_play_date instanceof Date
        ? u.last_play_date.toISOString().slice(0, 10)
        : u.last_play_date ?? null;

    // Already counted today.
    if (lastPlayDate === today) {
        return {
            playStreak: u.play_streak,
            advanced: false,
            dailyCoins: 0,
            milestone: null,
            shieldsUsed: 0,
        };
    }

    const { streak: newStreak, shieldsUsed } = nextStreak({
        lastPlayDate,
        today,
        streak: u.play_streak,
        shields: u.streak_shields ?? 0,
    });
    void yesterday;
    const newBest = Math.max(u.play_streak_best, newStreak);
    // ponytail: no row lock; the `last_play_date != today` filter makes a
    // racing second match-end on the same day a no-op.
    const written = await users.updateOne(
        { id: userId, last_play_date: { $ne: today } },
        {
            $set: { play_streak: newStreak, play_streak_best: newBest, last_play_date: today, updated_at: new Date() },
            $inc: { streak_shields: -shieldsUsed },
        }
    );
    if (!written.matchedCount) {
        return { playStreak: newStreak, advanced: false, dailyCoins: 0, milestone: null, shieldsUsed: 0 };
    }
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
            await users.updateOne({ id: userId }, { $inc: { hint_credits: milestone.hintCredits } });
        }
    }

    return {
        playStreak: newStreak,
        advanced: true,
        dailyCoins: DAILY_COIN_REWARD,
        milestone,
        shieldsUsed,
    };
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
    lastPlayDate: Date | string | null,
    shields = 0
): number {
    if (!lastPlayDate) return 0;
    const today = todayUtcDateString();
    const yesterday = yesterdayUtcDateString();
    const lastStr =
        lastPlayDate instanceof Date
            ? lastPlayDate.toISOString().slice(0, 10)
            : String(lastPlayDate).slice(0, 10);
    if (lastStr === today || lastStr === yesterday || daysBetween(lastStr, today) - 1 <= shields) return storedStreak;
    return 0;
}
