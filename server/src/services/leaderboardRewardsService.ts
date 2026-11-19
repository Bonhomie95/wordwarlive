// Leaderboard prizes. When a daily, weekly or monthly leaderboard or a Daily
// Challenge closes, the top 100 of the board as players saw it (synthetic
// players hold their places but are never paid) win coins by tier. Real
// players who finished below 100 get a coins-0 "so close" notice instead,
// so they know how far they were from a prize.
//
// Every result is one leaderboard_rewards doc, unique per (board, bucket,
// user), inserted before any coins are granted, so a re-run never pays or
// notifies twice. leaderboard_payouts marks a closed bucket as handled. Each
// player gets one push per payout run and, in the app, a popup listing unseen
// results (GET /api/rewards/pending).

import { col, newId, registerIndexes } from '../db/mongo.js';
import { grantCoins } from './coinsService.js';
import { sendPushToUser } from './pushService.js';
import { bucketFor, finalStandings } from './leaderboardService.js';
import { dailyStandings } from './dailyChallengeService.js';
import { logger } from '../utils/logger.js';

registerIndexes('leaderboard_rewards', [
    { key: { board: 1, bucket: 1, user_id: 1 }, unique: true },
    { key: { user_id: 1, seen: 1, created_at: -1 } },
]);
registerIndexes('leaderboard_payouts', [{ key: { id: 1 }, unique: true }]);

export type RewardBoard = 'daily' | 'weekly' | 'monthly' | 'daily_challenge';
const BOARDS: RewardBoard[] = ['daily', 'weekly', 'monthly', 'daily_challenge'];

/** [last rank of the tier, coins]. Ranks 1, 2, 3, 4–10, 11–20 … 91–100. */
const TIERS: Record<RewardBoard, readonly [number, number][]> = {
    daily: [[1, 200], [2, 150], [3, 100], [10, 60], [20, 40], [30, 30], [40, 25], [50, 20], [60, 15], [70, 12], [80, 10], [90, 8], [100, 5]],
    weekly: [[1, 750], [2, 500], [3, 350], [10, 200], [20, 120], [30, 90], [40, 70], [50, 55], [60, 45], [70, 35], [80, 30], [90, 25], [100, 20]],
    monthly: [[1, 2500], [2, 1750], [3, 1250], [10, 700], [20, 400], [30, 300], [40, 240], [50, 200], [60, 160], [70, 130], [80, 110], [90, 90], [100, 75]],
    daily_challenge: [[1, 150], [2, 100], [3, 75], [10, 50], [20, 30], [30, 25], [40, 20], [50, 15], [60, 12], [70, 10], [80, 8], [90, 6], [100, 5]],
};

/** Only boards that close after the feature shipped are paid. */
const PAYOUTS_FROM = Date.parse('2026-11-19T00:00:00Z');
const DAY_MS = 86_400_000;

export function prizeFor(board: RewardBoard, rank: number): number {
    for (const [last, coins] of TIERS[board]) if (rank <= last) return coins;
    return 0;
}

/** The prize table for the app: [{ from, to, coins }]. */
export function prizeTable(board: RewardBoard): { from: number; to: number; coins: number }[] {
    let from = 1;
    return TIERS[board].map(([to, coins]) => {
        const row = { from, to, coins };
        from = to + 1;
        return row;
    });
}

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** When the board's current bucket closes (UTC midnight / Monday / 1st). */
export function currentEndsAt(board: RewardBoard, now = new Date()): Date {
    const today = utcDay(now);
    if (board === 'weekly') return new Date(today.getTime() + (7 - ((today.getUTCDay() + 6) % 7)) * DAY_MS);
    if (board === 'monthly') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return new Date(today.getTime() + DAY_MS);
}

/** The most recently closed bucket of a board and the moment it closed. */
export function lastClosed(board: RewardBoard, now = new Date()): { bucket: string; endsAt: Date } {
    const today = utcDay(now);
    if (board === 'weekly') {
        const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
        return { bucket: bucketFor('weekly', new Date(monday.getTime() - DAY_MS)), endsAt: monday };
    }
    if (board === 'monthly') {
        const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return { bucket: bucketFor('monthly', new Date(first.getTime() - DAY_MS)), endsAt: first };
    }
    return { bucket: new Date(today.getTime() - DAY_MS).toISOString().slice(0, 10), endsAt: today };
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "the daily leaderboard for Nov 18", "the weekly leaderboard (Nov 16–22)" … */
export function boardLabel(board: RewardBoard, endsAt: Date): string {
    const last = new Date(endsAt.getTime() - DAY_MS);
    if (board === 'daily') return `the daily leaderboard for ${fmtDay(last)}`;
    if (board === 'daily_challenge') return `the Daily Challenge for ${fmtDay(last)}`;
    if (board === 'weekly') return `the weekly leaderboard (${fmtDay(new Date(endsAt.getTime() - 7 * DAY_MS))}–${fmtDay(last)})`;
    return `the ${last.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })} leaderboard`;
}

interface RewardDoc {
    id: string;
    board: RewardBoard;
    bucket: string;
    user_id: string;
    rank: number;
    coins: number;
    label: string;
    seen: boolean;
    created_at: Date;
}

interface Notice {
    userId: string;
    rank: number;
    coins: number;
    label: string;
}

/** Pay one closed bucket. Safe to call again: claims the run, skips players
 *  already handled. Returns the results created by this call. */
async function payBucket(board: RewardBoard, bucket: string, endsAt: Date): Promise<Notice[]> {
    const runs = col<{ id: string; done: boolean; started_at: Date }>('leaderboard_payouts');
    const id = `${board}:${bucket}`;
    try {
        await runs.insertOne({ id, done: false, started_at: new Date() });
    } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
        // Already handled, or running elsewhere. A run stuck for 15 min is retried.
        const stale = await runs.findOneAndUpdate(
            { id, done: false, started_at: { $lt: new Date(Date.now() - 15 * 60_000) } },
            { $set: { started_at: new Date() } }
        );
        if (!stale) return [];
    }

    const nowMs = endsAt.getTime() - 1;
    const standings =
        board === 'daily_challenge'
            ? (await dailyStandings(bucket, nowMs)).map((e, i) => ({ userId: e.userId, rank: i + 1, real: e.real }))
            : await finalStandings(board, bucket, nowMs);
    const label = boardLabel(board, endsAt);
    const rewards = col<RewardDoc>('leaderboard_rewards');
    const notices: Notice[] = [];
    // ponytail: one insert per real player; batch with insertMany(ordered:false) if boards reach thousands.
    for (const s of standings) {
        if (!s.real) continue;
        const coins = prizeFor(board, s.rank);
        try {
            await rewards.insertOne({
                id: newId(), board, bucket, user_id: s.userId, rank: s.rank, coins, label, seen: false, created_at: new Date(),
            });
        } catch (err) {
            if ((err as { code?: number }).code === 11000) continue; // paid on an earlier run
            throw err;
        }
        // ponytail: a crash between the insert and the grant drops that one prize; add a granted flag if it ever matters.
        if (coins) {
            await grantCoins({ userId: s.userId, amount: coins, source: 'leaderboard_reward', metadata: { board, bucket, rank: s.rank } });
        }
        notices.push({ userId: s.userId, rank: s.rank, coins, label });
    }
    const paid = notices.filter((n) => n.coins).length;
    await runs.updateOne({ id }, { $set: { done: true, paid, missed: notices.length - paid, finished_at: new Date() } });
    logger.info({ board, bucket, paid, missed: notices.length - paid }, 'leaderboard rewards paid');
    return notices;
}

/** One line per result: "+60 coins for #5 on …" / "#134 on … (34 places from a prize)". */
export function noticeLine(n: { rank: number; coins: number; label: string }): string {
    return n.coins
        ? `+${n.coins} coins for #${n.rank} on ${n.label}`
        : `#${n.rank} on ${n.label}, ${n.rank - 100} ${n.rank - 100 === 1 ? 'place' : 'places'} from a prize`;
}

/** One push per player for everything a payout run produced for them. */
function pushNotices(notices: Notice[]): void {
    const byUser = new Map<string, Notice[]>();
    for (const n of notices) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
    for (const [userId, list] of byUser) {
        const won = list.filter((n) => n.coins);
        const title = won.length
            ? `🏆 You won ${won.reduce((t, n) => t + n.coins, 0)} coins!`
            : 'So close to a prize!';
        const tail = won.length ? '' : ' The top 100 win coins, so play today to climb in.';
        void sendPushToUser(userId, {
            title,
            body: `${list.map(noticeLine).join('. ')}.${tail}`,
            data: { type: 'leaderboard_reward' },
        });
    }
}

/** Pay every board whose last bucket closed and hasn't been paid yet. */
export async function runLeaderboardPayouts(now = new Date()): Promise<void> {
    const notices: Notice[] = [];
    for (const board of BOARDS) {
        const { bucket, endsAt } = lastClosed(board, now);
        if (endsAt.getTime() < PAYOUTS_FROM) continue;
        try {
            notices.push(...(await payBucket(board, bucket, endsAt)));
        } catch (err) {
            logger.error({ err, board, bucket }, 'leaderboard payout failed');
        }
    }
    pushNotices(notices);
}

/** Check shortly after boot and every 10 minutes (each closed bucket pays once). */
export function startLeaderboardPayouts(): void {
    const tick = () => void runLeaderboardPayouts().catch((err) => logger.error({ err }, 'payout tick failed'));
    setTimeout(tick, 30_000).unref();
    setInterval(tick, 10 * 60_000).unref();
}

export async function pendingRewards(userId: string) {
    const rows = await col<RewardDoc>('leaderboard_rewards')
        .find({ user_id: userId, seen: false }, { projection: { _id: 0 }, sort: { created_at: -1 }, limit: 20 })
        .toArray();
    return rows.map((r) => ({ id: r.id, board: r.board, rank: r.rank, coins: r.coins, label: r.label, createdAt: r.created_at.toISOString() }));
}

export async function markRewardsSeen(userId: string, ids: string[]): Promise<void> {
    await col('leaderboard_rewards').updateMany({ user_id: userId, id: { $in: ids } }, { $set: { seen: true } });
}
