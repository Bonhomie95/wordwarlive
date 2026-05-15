// Ranked seasons.
//
// A season is a window of competitive play. When a new season begins,
// each player's rank_points get soft-reset (capped drop, so high-ranked
// players don't completely lose ladder position). End-of-season rewards
// are claimable based on the player's peak rank achieved that season.
//
// Mechanics:
//   - Soft reset: rank_points -= soft_reset_delta (default 200), floored
//     at 1000 (the bottom of Bronze) so no one drops to Stone tier from
//     a reset alone.
//   - Peak rank: tracked in rank_season_results so end-of-season rewards
//     reflect the highest rank achieved, not the final rank.
//   - Reset is idempotent: gated by users.last_rank_season_reset_id.

import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export interface RankSeason {
    id: number;
    name: string;
    startsAt: string;
    endsAt: string;
    softResetDelta: number;
}

const MIN_POST_RESET_POINTS = 1000;

/** Get the currently-active season (the one we're inside). */
export async function getCurrentSeason(): Promise<RankSeason | null> {
    const rows = await query<{
        id: number;
        name: string;
        starts_at: Date;
        ends_at: Date;
        soft_reset_delta: number;
    }>(
        `SELECT id, name, starts_at, ends_at, soft_reset_delta
         FROM rank_seasons
         WHERE now() BETWEEN starts_at AND ends_at
         ORDER BY id DESC
         LIMIT 1`
    );
    const r = rows[0];
    if (!r) return null;
    return {
        id: r.id,
        name: r.name,
        startsAt: r.starts_at.toISOString(),
        endsAt: r.ends_at.toISOString(),
        softResetDelta: r.soft_reset_delta,
    };
}

/**
 * Apply the soft reset for a user if they haven't been reset for the
 * current season yet. Called on /me so every player picks up the reset
 * the next time they open the app after a season transition.
 *
 * Also records the previous season's final + peak rank in
 * rank_season_results so the rewards screen can show their result.
 */
export async function applyResetIfNeeded(userId: string): Promise<{
    resetApplied: boolean;
    previousSeasonResult?: {
        seasonId: number;
        peakPoints: number;
        finalPoints: number;
        finalTier: string;
    };
}> {
    const season = await getCurrentSeason();
    if (!season) return { resetApplied: false };

    const userRows = await query<{
        last_reset_id: number | null;
        rank_points: number;
        rank_tier: string;
    }>(
        `SELECT last_rank_season_reset_id AS last_reset_id, rank_points, rank_tier
         FROM users WHERE id = $1`,
        [userId]
    );
    const u = userRows[0];
    if (!u) return { resetApplied: false };
    if (u.last_reset_id === season.id) return { resetApplied: false };

    // Determine the previous season this player was last in, so we can
    // record their final state there.
    let previousResult: {
        seasonId: number;
        peakPoints: number;
        finalPoints: number;
        finalTier: string;
    } | undefined;
    if (u.last_reset_id !== null) {
        // last_reset_id is the season they were last *reset for* — i.e., the
        // season they just finished. Record their final.
        const prevSeasonId = u.last_reset_id;
        // Peak comes from the rank_season_results table (we update it on
        // every match win); fall back to current points if no row.
        const peakRows = await query<{ peak: number }>(
            `SELECT peak_points AS peak FROM rank_season_results
             WHERE season_id = $1 AND user_id = $2`,
            [prevSeasonId, userId]
        );
        const peakPoints = peakRows[0]?.peak ?? u.rank_points;
        await query(
            `INSERT INTO rank_season_results
                (season_id, user_id, peak_points, final_points, final_tier)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (season_id, user_id) DO UPDATE SET
                final_points = EXCLUDED.final_points,
                final_tier = EXCLUDED.final_tier`,
            [prevSeasonId, userId, peakPoints, u.rank_points, u.rank_tier]
        );
        previousResult = {
            seasonId: prevSeasonId,
            peakPoints,
            finalPoints: u.rank_points,
            finalTier: u.rank_tier,
        };
    }

    // Apply the soft reset.
    const newPoints = Math.max(
        MIN_POST_RESET_POINTS,
        u.rank_points - season.softResetDelta
    );
    await query(
        `UPDATE users SET
            rank_points = $1,
            last_rank_season_reset_id = $2,
            updated_at = now()
         WHERE id = $3`,
        [newPoints, season.id, userId]
    );
    // Re-tier them. We don't import ranks.ts here to keep the dep simple —
    // tier will fix itself the next time the user's rank changes (a match
    // result triggers retier).
    logger.info(
        { userId, oldPoints: u.rank_points, newPoints, seasonId: season.id },
        'rank season soft-reset applied'
    );
    return { resetApplied: true, previousSeasonResult: previousResult };
}

/**
 * After every match-result, also update peak_points for this season if the
 * player's new rank_points exceeded their previous peak. Cheap upsert.
 */
export async function updatePeak(
    userId: string,
    currentPoints: number
): Promise<void> {
    const season = await getCurrentSeason();
    if (!season) return;
    await query(
        `INSERT INTO rank_season_results (season_id, user_id, peak_points, final_points, final_tier)
         VALUES ($1, $2, $3, $3, '')
         ON CONFLICT (season_id, user_id) DO UPDATE SET
            peak_points = GREATEST(rank_season_results.peak_points, EXCLUDED.peak_points)`,
        [season.id, userId, currentPoints]
    );
}
