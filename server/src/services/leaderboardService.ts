// Leaderboard service. Computes period buckets (daily / weekly / monthly /
// all_time) and maintains a pre-aggregated `leaderboard_entries` table so
// top-N lookups are index-only scans.
//
// Why pre-aggregate? With N matches and M users over a year, computing
// "current month leaderboard" on demand means scanning every match in the
// month and grouping. With a counter table, it's a single sorted index seek.
//
// Updated on every match completion (winner gets +1 win; loser gets +1 loss).

import { pool } from '../db/pool.js';

export type LeaderboardPeriod = 'all_time' | 'monthly' | 'weekly' | 'daily';

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

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const b of buckets) {
            for (const m of modes) {
                await client.query(
                    `INSERT INTO leaderboard_entries
                        (user_id, period, bucket, mode, wins, losses, rank_points, last_match_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
                     ON CONFLICT (period, bucket, mode, user_id) DO UPDATE
                     SET wins = leaderboard_entries.wins + EXCLUDED.wins,
                         losses = leaderboard_entries.losses + EXCLUDED.losses,
                         rank_points = EXCLUDED.rank_points,
                         last_match_at = now()`,
                    [
                        args.userId,
                        b.period,
                        b.bucket,
                        m,
                        args.isWin ? 1 : 0,
                        args.isWin ? 0 : 1,
                        args.rankPoints,
                    ]
                );
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
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
}): Promise<LeaderboardResponse> {
    const limit = Math.min(args.limit ?? 50, 100);
    const bucket = bucketFor(args.period);
    const mode = args.mode ?? 'overall';

    const { query } = await import('../db/pool.js');

    const topRows = await query<{
        user_id: string;
        username: string;
        rank_tier: string;
        wins: number;
        losses: number;
        rank_points: number;
        equipped_avatar: string | null;
        equipped_profile_border: string | null;
        rank_in_leaderboard: string;
    }>(
        `SELECT
            le.user_id,
            u.username,
            u.rank_tier,
            le.wins,
            le.losses,
            le.rank_points,
            u.equipped_avatar,
            u.equipped_profile_border,
            ROW_NUMBER() OVER (ORDER BY le.wins DESC, le.rank_points DESC) AS rank_in_leaderboard
         FROM leaderboard_entries le
         JOIN users u ON u.id = le.user_id
         WHERE le.period = $1 AND le.bucket = $2 AND le.mode = $3
           AND u.auth_subject NOT LIKE 'bot-%'
         ORDER BY le.wins DESC, le.rank_points DESC
         LIMIT $4`,
        [args.period, bucket, mode, limit]
    );

    const entries: LeaderboardEntry[] = topRows.map((r) => ({
        userId: r.user_id,
        username: r.username,
        rankTier: r.rank_tier,
        wins: r.wins,
        losses: r.losses,
        rankPoints: r.rank_points,
        avatarId: r.equipped_avatar,
        profileBorderId: r.equipped_profile_border,
        rankInLeaderboard: Number(r.rank_in_leaderboard),
    }));

    let you: LeaderboardEntry | null = null;
    if (args.requesterId) {
        const youRows = await query<{
            user_id: string;
            username: string;
            rank_tier: string;
            wins: number;
            losses: number;
            rank_points: number;
            equipped_avatar: string | null;
            equipped_profile_border: string | null;
            rank_in_leaderboard: string;
        }>(
            `WITH ranked AS (
                SELECT
                    le.user_id,
                    u.username,
                    u.rank_tier,
                    le.wins,
                    le.losses,
                    le.rank_points,
                    u.equipped_avatar,
                    u.equipped_profile_border,
                    ROW_NUMBER() OVER (ORDER BY le.wins DESC, le.rank_points DESC) AS rank_in_leaderboard
                 FROM leaderboard_entries le
                 JOIN users u ON u.id = le.user_id
                 WHERE le.period = $1 AND le.bucket = $2 AND le.mode = $3
                   AND u.auth_subject NOT LIKE 'bot-%'
            )
            SELECT * FROM ranked WHERE user_id = $4`,
            [args.period, bucket, mode, args.requesterId]
        );
        const r = youRows[0];
        if (r) {
            you = {
                userId: r.user_id,
                username: r.username,
                rankTier: r.rank_tier,
                wins: r.wins,
                losses: r.losses,
                rankPoints: r.rank_points,
                avatarId: r.equipped_avatar,
                profileBorderId: r.equipped_profile_border,
                rankInLeaderboard: Number(r.rank_in_leaderboard),
            };
        }
    }

    return { period: args.period, bucket, entries, you };
}
