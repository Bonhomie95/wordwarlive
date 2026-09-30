// Ranked seasons.
//
// A season is a window of competitive play. When a new season begins,
// each player's rank_points get soft-reset (capped drop, so high-ranked
// players don't completely lose ladder position). End-of-season rewards
// are claimable based on the player's peak rank achieved that season.
//
// Mechanics:
//   - Soft reset: rank_points -= soft_reset_delta (default 200), floored
//     at 1000; players already below the floor keep their points.
//   - Peak rank: tracked in rank_season_results so end-of-season rewards
//     reflect the highest rank achieved, not the final rank.
//   - Reset is idempotent: gated by users.last_rank_season_reset_id.

import { tierFromPoints, softResetPoints } from '../game/ranks.js';
import { col, registerIndexes } from '../db/mongo.js';
import { logger } from '../utils/logger.js';

registerIndexes('rank_seasons', [{ key: { id: 1 }, unique: true }, { key: { starts_at: 1, ends_at: 1 } }]);
registerIndexes('rank_season_results', [{ key: { season_id: 1, user_id: 1 }, unique: true }]);

export interface RankSeason {
    id: number;
    name: string;
    startsAt: string;
    endsAt: string;
    softResetDelta: number;
}

interface SeasonDoc {
    id: number;
    name: string;
    starts_at: Date;
    ends_at: Date;
    soft_reset_delta: number;
}

interface SeasonResultDoc {
    season_id: number;
    user_id: string;
    peak_points: number;
    final_points: number;
    final_tier: string;
    rewarded: boolean;
}

/** Get the currently-active season (the one we're inside). */
export async function getCurrentSeason(): Promise<RankSeason | null> {
    const now = new Date();
    const r = await col<SeasonDoc>('rank_seasons').findOne(
        { starts_at: { $lte: now }, ends_at: { $gte: now } },
        { sort: { id: -1 }, projection: { _id: 0 } }
    );
    if (!r) return null;
    return {
        id: r.id,
        name: r.name,
        startsAt: new Date(r.starts_at).toISOString(),
        endsAt: new Date(r.ends_at).toISOString(),
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

    const users = col<{ last_rank_season_reset_id: number | null; rank_points: number; rank_tier: string }>('users');
    const u = await users.findOne(
        { id: userId },
        { projection: { _id: 0, last_rank_season_reset_id: 1, rank_points: 1, rank_tier: 1 } }
    );
    if (!u) return { resetApplied: false };
    const lastResetId = u.last_rank_season_reset_id ?? null;
    if (lastResetId === season.id) return { resetApplied: false };

    // Determine the previous season this player was last in, so we can
    // record their final state there.
    let previousResult: {
        seasonId: number;
        peakPoints: number;
        finalPoints: number;
        finalTier: string;
    } | undefined;
    if (lastResetId !== null) {
        // last_reset_id is the season they were last *reset for* — i.e., the
        // season they just finished. Record their final.
        const prevSeasonId = lastResetId;
        // Peak comes from the rank_season_results collection (we update it on
        // every match win); fall back to current points if no doc.
        const results = col<SeasonResultDoc>('rank_season_results');
        const peakRow = await results.findOne(
            { season_id: prevSeasonId, user_id: userId },
            { projection: { _id: 0, peak_points: 1 } }
        );
        const peakPoints = peakRow?.peak_points ?? u.rank_points;
        await results.updateOne(
            { season_id: prevSeasonId, user_id: userId },
            {
                $set: { final_points: u.rank_points, final_tier: u.rank_tier },
                $setOnInsert: { season_id: prevSeasonId, user_id: userId, peak_points: peakPoints, rewarded: false },
            },
            { upsert: true }
        );
        previousResult = {
            seasonId: prevSeasonId,
            peakPoints,
            finalPoints: u.rank_points,
            finalTier: u.rank_tier,
        };
    }

    // Apply the soft reset. The reset-id filter replaces the old row lock:
    // a concurrent /me can only apply it once.
    const newPoints = softResetPoints(u.rank_points, season.softResetDelta);
    const written = await users.updateOne(
        { id: userId, last_rank_season_reset_id: { $ne: season.id } },
        {
            $set: {
                rank_points: newPoints,
                rank_tier: tierFromPoints(newPoints),
                last_rank_season_reset_id: season.id,
                updated_at: new Date(),
            },
        }
    );
    if (!written.matchedCount) return { resetApplied: false };
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
    await col<SeasonResultDoc>('rank_season_results').updateOne(
        { season_id: season.id, user_id: userId },
        {
            $max: { peak_points: currentPoints },
            $setOnInsert: { season_id: season.id, user_id: userId, final_points: currentPoints, final_tier: '', rewarded: false },
        },
        { upsert: true }
    );
}
