// Battle pass logic. Players earn XP per match (win or loss); each
// `xp_per_tier` XP advances them to the next tier. Tiers grant cosmetics on
// either the free or premium track. Premium ($3.99/mo) unlocks the premium
// track for the current season.

import { pool, query } from '../db/pool.js';
import { grantCosmetic } from './cosmeticsService.js';

const XP_PER_WIN = 60;
const XP_PER_LOSS = 25;
const XP_PER_TIE = 35;

export function xpForMatch(result: 'win' | 'loss' | 'tie'): number {
    if (result === 'win') return XP_PER_WIN;
    if (result === 'tie') return XP_PER_TIE;
    return XP_PER_LOSS;
}

export interface SeasonRow {
    season_number: number;
    name: string;
    starts_at: string;
    ends_at: string;
    xp_per_tier: number;
    max_tier: number;
}

export async function getCurrentSeason(): Promise<SeasonRow | null> {
    const rows = await query<SeasonRow>(
        `SELECT season_number, name, starts_at, ends_at, xp_per_tier, max_tier
         FROM battle_pass_seasons
         WHERE now() BETWEEN starts_at AND ends_at
         ORDER BY season_number DESC
         LIMIT 1`
    );
    return rows[0] ?? null;
}

export async function awardMatchXp(args: {
    userId: string;
    result: 'win' | 'loss' | 'tie';
}): Promise<{ xpAwarded: number; newXp: number; newTier: number }> {
    const xpAwarded = xpForMatch(args.result);
    const season = await getCurrentSeason();
    if (!season) {
        return { xpAwarded: 0, newXp: 0, newTier: 0 };
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // If the user is on an old season, reset their progress first.
        const cur = await client.query<{
            battle_pass_xp: number;
            battle_pass_season: number;
        }>(
            `SELECT battle_pass_xp, battle_pass_season FROM users WHERE id = $1 FOR UPDATE`,
            [args.userId]
        );
        const u = cur.rows[0];
        if (!u) throw new Error('User not found');

        let baseXp = u.battle_pass_xp;
        if (u.battle_pass_season !== season.season_number) {
            baseXp = 0;
        }

        const newXp = baseXp + xpAwarded;
        const newTier = Math.min(
            Math.floor(newXp / season.xp_per_tier),
            season.max_tier
        );

        await client.query(
            `UPDATE users SET battle_pass_xp = $1, battle_pass_season = $2, updated_at = now()
             WHERE id = $3`,
            [newXp, season.season_number, args.userId]
        );

        await client.query('COMMIT');
        return { xpAwarded, newXp, newTier };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export interface BattlePassRewardRow {
    tier: number;
    track: 'free' | 'premium';
    cosmetic_id: string | null;
}

export async function listSeasonRewards(seasonNumber: number): Promise<BattlePassRewardRow[]> {
    return query<BattlePassRewardRow>(
        `SELECT tier, track, cosmetic_id FROM battle_pass_rewards
         WHERE season_number = $1 ORDER BY tier ASC, track ASC`,
        [seasonNumber]
    );
}

export async function listClaims(
    userId: string,
    seasonNumber: number
): Promise<{ tier: number; track: 'free' | 'premium' }[]> {
    return query<{ tier: number; track: 'free' | 'premium' }>(
        `SELECT tier, track FROM battle_pass_claims
         WHERE user_id = $1 AND season_number = $2`,
        [userId, seasonNumber]
    );
}

export interface ClaimResult {
    granted: boolean;
    cosmeticId: string | null;
    error?: string;
}

/**
 * Claim a tier reward. Idempotent — calling twice with the same args is a
 * no-op the second time.
 */
export async function claimTier(args: {
    userId: string;
    seasonNumber: number;
    tier: number;
    track: 'free' | 'premium';
}): Promise<ClaimResult> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Confirm the user has crossed this tier and (for premium) has unlocked.
        const userRow = await client.query<{
            battle_pass_xp: number;
            battle_pass_premium: boolean;
            battle_pass_season: number;
        }>(
            `SELECT battle_pass_xp, battle_pass_premium, battle_pass_season
             FROM users WHERE id = $1 FOR UPDATE`,
            [args.userId]
        );
        const u = userRow.rows[0];
        if (!u) {
            await client.query('ROLLBACK');
            return { granted: false, cosmeticId: null, error: 'User not found' };
        }

        const seasonRow = await client.query<{
            xp_per_tier: number;
            max_tier: number;
        }>(
            `SELECT xp_per_tier, max_tier FROM battle_pass_seasons
             WHERE season_number = $1`,
            [args.seasonNumber]
        );
        const s = seasonRow.rows[0];
        if (!s) {
            await client.query('ROLLBACK');
            return { granted: false, cosmeticId: null, error: 'Unknown season' };
        }

        // Make sure the user is on this season; otherwise their XP is from
        // a different season.
        if (u.battle_pass_season !== args.seasonNumber) {
            await client.query('ROLLBACK');
            return { granted: false, cosmeticId: null, error: 'Not your active season' };
        }
        if (args.track === 'premium' && !u.battle_pass_premium) {
            await client.query('ROLLBACK');
            return { granted: false, cosmeticId: null, error: 'Premium track not unlocked' };
        }
        const earnedTier = Math.floor(u.battle_pass_xp / s.xp_per_tier);
        if (args.tier > earnedTier || args.tier > s.max_tier || args.tier < 1) {
            await client.query('ROLLBACK');
            return { granted: false, cosmeticId: null, error: 'Tier not yet reached' };
        }

        // Already claimed?
        const claimedRes = await client.query(
            `SELECT 1 FROM battle_pass_claims
             WHERE user_id = $1 AND season_number = $2 AND tier = $3 AND track = $4`,
            [args.userId, args.seasonNumber, args.tier, args.track]
        );
        if ((claimedRes.rowCount ?? 0) > 0) {
            await client.query('ROLLBACK');
            return { granted: false, cosmeticId: null, error: 'Already claimed' };
        }

        // What's the reward?
        const rewardRes = await client.query<{ cosmetic_id: string | null }>(
            `SELECT cosmetic_id FROM battle_pass_rewards
             WHERE season_number = $1 AND tier = $2 AND track = $3`,
            [args.seasonNumber, args.tier, args.track]
        );
        const cosmeticId = rewardRes.rows[0]?.cosmetic_id ?? null;

        await client.query(
            `INSERT INTO battle_pass_claims (user_id, season_number, tier, track)
             VALUES ($1, $2, $3, $4)`,
            [args.userId, args.seasonNumber, args.tier, args.track]
        );
        await client.query('COMMIT');

        if (cosmeticId) {
            await grantCosmetic(args.userId, cosmeticId, 'battle_pass');
        }
        return { granted: true, cosmeticId };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Mark the user as having unlocked the current season's premium track. The
 * actual payment happens client-side via an IAP — server should verify the
 * receipt before calling this. We accept the call as-is in dev.
 */
export async function unlockPremium(userId: string): Promise<void> {
    // TODO(prod): verify the IAP receipt server-side before flipping the bit.
    const season = await getCurrentSeason();
    if (!season) throw new Error('No active season');
    await query(
        `UPDATE users SET battle_pass_premium = TRUE, battle_pass_season = $1, updated_at = now()
         WHERE id = $2`,
        [season.season_number, userId]
    );
}
