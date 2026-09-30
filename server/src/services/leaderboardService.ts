// Leaderboard service. Computes period buckets (daily / weekly / monthly /
// all_time) and maintains a pre-aggregated `leaderboard_entries` collection so
// top-N lookups are index-only scans.
//
// Why pre-aggregate? With N matches and M users over a year, computing
// "current month leaderboard" on demand means scanning every match in the
// month and grouping. With a counter collection, it's a single sorted index seek.
//
// Updated on every match completion (winner gets +1 win; loser gets +1 loss).

import type { Document } from 'mongodb';
import { compareStandings } from './syntheticPlayers.js';
import { persistedSyntheticLeaderboard } from './syntheticHistory.js';
import { col, registerIndexes } from '../db/mongo.js';
import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';

registerIndexes('leaderboard_entries', [
    { key: { period: 1, bucket: 1, mode: 1, user_id: 1 }, unique: true },
    { key: { period: 1, bucket: 1, mode: 1, wins: -1, rank_points: -1, user_id: 1 } },
]);
registerIndexes('users', [{ key: { id: 1 }, unique: true }]);

export type LeaderboardPeriod = 'all_time' | 'monthly' | 'weekly' | 'daily';

/** Top-N leaderboard rows are identical for every viewer, so we cache them in
 *  Redis for a short window. The per-viewer "you" row is always computed live
 *  and never cached. */
const LEADERBOARD_CACHE_TTL_S = 15;

/**
 * Compute the bucket label for a given period at the given timestamp.
 * Used by the writer (on match completion) and by the reader (when looking
 * up the current bucket).
 */
export function bucketFor(period: LeaderboardPeriod, when: Date = new Date()): string {
    switch (period) {
        case 'all_time':
            return 'all';
        case 'monthly':
            return when.toISOString().slice(0, 7); // YYYY-MM
        case 'daily':
            return when.toISOString().slice(0, 10); // YYYY-MM-DD
        case 'weekly':
            return isoWeekBucket(when);
    }
}

/**
 * ISO 8601 week bucket — `YYYY-WNN`. Week starts Monday; weeks containing
 * Jan 4 belong to that year.
 *
 * Implemented manually so we don't pull in date-fns just for this.
 */
function isoWeekBucket(d: Date): string {
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Day of week, 1 = Monday … 7 = Sunday.
    const dayNum = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNum + 3); // Move to Thursday.
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const firstDay = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
    const week =
        1 +
        Math.round(
            (target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
    return `${target.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

interface RecordResultArgs {
    userId: string;
    isWin: boolean;
    rankPoints: number;
    /** 'classic' | 'mystery' | 'overall'. We always also write to 'overall'
     *  for combined leaderboards. */
    mode: 'classic' | 'mystery';
}

/**
 * Bump win/loss counters for the user across all four periods + (mode, 'overall').
 */
export async function recordMatchResult(args: RecordResultArgs): Promise<void> {
    const now = new Date();
    const buckets: Array<{ period: LeaderboardPeriod; bucket: string }> = [
        { period: 'all_time', bucket: bucketFor('all_time', now) },
        { period: 'monthly', bucket: bucketFor('monthly', now) },
        { period: 'weekly', bucket: bucketFor('weekly', now) },
        { period: 'daily', bucket: bucketFor('daily', now) },
    ];

    // Write to both the mode-specific row AND the 'overall' row so combined
    // leaderboards work without scanning multiple modes.
    const modes: string[] = [args.mode, 'overall'];

    // 4 periods × 2 modes = 8 upserts in one round trip.
    const ops = [];
    for (const b of buckets) {
        for (const m of modes) {
            ops.push({
                updateOne: {
                    filter: { period: b.period, bucket: b.bucket, mode: m, user_id: args.userId },
                    update: {
                        $inc: { wins: args.isWin ? 1 : 0, losses: args.isWin ? 0 : 1 },
                        $set: { rank_points: args.rankPoints, last_match_at: now },
                    },
                    upsert: true,
                },
            });
        }
    }
    await col('leaderboard_entries').bulkWrite(ops, { ordered: false });
}

export interface LeaderboardEntry {
    userId: string;
    username: string;
    rankTier: string;
    wins: number;
    losses: number;
    rankPoints: number;
    rankInLeaderboard: number;
    /** Equipped avatar / profile border for display. */
    avatarId: string | null;
    profileBorderId: string | null;
}

export interface LeaderboardResponse {
    period: LeaderboardPeriod;
    bucket: string;
    /** Top-N entries by wins desc, rank_points desc as tiebreak. */
    entries: LeaderboardEntry[];
    /** The requesting user's own rank in this leaderboard (or null if they
     *  haven't played in this period yet). */
    you: LeaderboardEntry | null;
}

interface RankedRow {
    user_id: string;
    username: string;
    rank_tier: string;
    wins: number;
    losses: number;
    rank_points: number;
    equipped_avatar: string | null;
    equipped_profile_border: string | null;
}

/** Entries for a board joined to their (human, unbanned) users. */
function rankedStages(period: LeaderboardPeriod, bucket: string, mode: string, extra: Document = {}): Document[] {
    return [
        { $match: { period, bucket, mode, ...extra } },
        { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'u' } },
        { $unwind: '$u' },
        { $match: { 'u.auth_subject': { $not: /^bot-/ }, 'u.banned': false } },
    ];
}

const PROJECT_ROW: Document = {
    $project: {
        _id: 0,
        user_id: 1,
        wins: 1,
        losses: 1,
        rank_points: 1,
        username: '$u.username',
        rank_tier: '$u.rank_tier',
        equipped_avatar: { $ifNull: ['$u.equipped_avatar', null] },
        equipped_profile_border: { $ifNull: ['$u.equipped_profile_border', null] },
    },
};

function toEntry(r: RankedRow, rank: number): LeaderboardEntry {
    return {
        userId: r.user_id,
        username: r.username,
        rankTier: r.rank_tier,
        wins: r.wins,
        losses: r.losses,
        rankPoints: r.rank_points,
        avatarId: r.equipped_avatar,
        profileBorderId: r.equipped_profile_border,
        rankInLeaderboard: rank,
    };
}

/**
 * Fetch the top-N leaderboard for a period. Joins with users to get the
 * display info. Tiebreaks on rank_points (so two players tied on wins are
 * ordered by skill).
 */
export async function getLeaderboard(args: {
    period: LeaderboardPeriod;
    /** 'classic' | 'mystery' | 'overall'. Defaults to 'overall'. */
    mode?: 'classic' | 'mystery' | 'overall';
    limit?: number;
    /** Optional caller's user id — if provided we also return their own rank. */
    requesterId?: string;
    /** Return a window of rows centred on the requester instead of the top-N
     *  (for "show my position" when they rank below the visible list). */
    around?: boolean;
}): Promise<LeaderboardResponse> {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 100));
    const bucket = bucketFor(args.period);
    const mode = args.mode ?? 'overall';
    const entriesCol = col('leaderboard_entries');

    // Short-lived cache of the shared top-N rows.
    const cacheKey = `lb:${args.period}:${bucket}:${mode}:${limit}`;
    let entries: LeaderboardEntry[] | null = null;
    try {
        const cached = await redis.get(cacheKey);
        if (cached) entries = JSON.parse(cached) as LeaderboardEntry[];
    } catch (err) {
        logger.warn({ err }, 'leaderboard cache read failed');
    }

    if (!entries) {
        const topRows = await entriesCol
            .aggregate<RankedRow>([
                ...rankedStages(args.period, bucket, mode),
                { $sort: { wins: -1, rank_points: -1, user_id: 1 } },
                { $limit: limit },
                PROJECT_ROW,
            ])
            .toArray();

        entries = topRows.map((r, i) => toEntry(r, i + 1));

        redis
            .set(cacheKey, JSON.stringify(entries), 'EX', LEADERBOARD_CACHE_TTL_S)
            .catch((err) => logger.warn({ err }, 'leaderboard cache write failed'));
    }

    let you: LeaderboardEntry | null = null;
    if (args.requesterId) {
        const [r] = await entriesCol
            .aggregate<RankedRow>([...rankedStages(args.period, bucket, mode, { user_id: args.requesterId }), PROJECT_ROW])
            .toArray();
        if (r) {
            // ROW_NUMBER() equivalent: 1 + humans strictly ahead in (wins desc, rank_points desc, user_id asc).
            const [ahead] = await entriesCol
                .aggregate<{ n: number }>([
                    ...rankedStages(args.period, bucket, mode, {
                        $or: [
                            { wins: { $gt: r.wins } },
                            { wins: r.wins, rank_points: { $gt: r.rank_points } },
                            { wins: r.wins, rank_points: r.rank_points, user_id: { $lt: r.user_id } },
                        ],
                    }),
                    { $count: 'n' },
                ])
                .toArray();
            you = toEntry(r, 1 + (ahead?.n ?? 0));
        }
    }

    const fillers = await persistedSyntheticLeaderboard(args.period, mode);
    const asFiller = (entry: (typeof fillers)[number]): LeaderboardEntry =>
        ({ ...entry, avatarId: null, profileBorderId: null, rankInLeaderboard: 0 });

    if (args.around && you && args.requesterId) {
        // ponytail: loads every human row in the bucket to place the requester
        // among the synthetic players; paginate server-side if humans grow large.
        const humans = await entriesCol
            .aggregate<RankedRow>([...rankedStages(args.period, bucket, mode), PROJECT_ROW])
            .toArray();
        const standings = [...humans.map((r) => toEntry(r, 0)), ...fillers.map(asFiller)]
            .sort(compareStandings)
            .map((entry, i) => ({ ...entry, rankInLeaderboard: i + 1 }));
        const idx = standings.findIndex((e) => e.userId === args.requesterId);
        const from = Math.max(0, idx - Math.floor(limit / 2));
        const window = standings.slice(from, from + limit);
        return { period: args.period, bucket, entries: window, you: standings[idx] ?? you };
    }

    const merged: LeaderboardEntry[] = [
        ...entries,
        ...fillers.map(asFiller),
    ].sort(compareStandings).slice(0, limit).map((entry, i) => ({ ...entry, rankInLeaderboard: i + 1 }));
    if (you) {
        const player = you;
        you = { ...player, rankInLeaderboard: player.rankInLeaderboard + fillers.filter((entry) => compareStandings(entry, player) < 0).length };
    }
    return { period: args.period, bucket, entries: merged, you };
}
