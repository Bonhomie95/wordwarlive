// Battle pass logic. Players earn XP per match (win or loss); each
// `xp_per_tier` XP advances them to the next tier. Tiers grant cosmetics on
// either the free or premium track. Premium ($3.99/mo) unlocks the premium
// track for the current season.

import { col, registerIndexes } from '../db/mongo.js';
import { grantCosmetic } from './cosmeticsService.js';

registerIndexes('battle_pass_seasons', [{ key: { season_number: 1 }, unique: true }]);
registerIndexes('battle_pass_rewards', [{ key: { season_number: 1, tier: 1, track: 1 }, unique: true }]);
registerIndexes('battle_pass_claims', [
    { key: { user_id: 1, season_number: 1, tier: 1, track: 1 }, unique: true },
]);

const XP_PER_WIN = 60;
const XP_PER_LOSS = 25;
const XP_PER_TIE = 35;

/** Match XP. Mirrors matchCoins: quitting, or losing without a single guess,
 *  earns nothing, so "start a match, quit" can't farm Pass tiers. */
export function xpForMatch(
    result: 'win' | 'loss' | 'tie',
    played: { forfeited: boolean; guessed: boolean } = { forfeited: false, guessed: true }
): number {
    if (played.forfeited) return 0;
    if (result === 'win') return XP_PER_WIN;
    if (!played.guessed) return 0;
    return result === 'tie' ? XP_PER_TIE : XP_PER_LOSS;
}

export interface SeasonRow {
    season_number: number;
    name: string;
    starts_at: string;
    ends_at: string;
    xp_per_tier: number;
    max_tier: number;
}

interface UserBpDoc {
    id: string;
    battle_pass_xp: number;
    battle_pass_premium: boolean;
    battle_pass_season: number;
    xp_boost_until: Date | null;
    updated_at: Date;
}

const SEASON_PROJECTION = {
    _id: 0, season_number: 1, name: 1, starts_at: 1, ends_at: 1, xp_per_tier: 1, max_tier: 1,
} as const;

// Stored timestamps are Dates; SeasonRow keeps the historical `string` type
// (pg also returned Date objects here — callers JSON-serialize either way).
type SeasonDoc = Omit<SeasonRow, 'starts_at' | 'ends_at'> & { starts_at: Date; ends_at: Date };

const SEASON_DAYS = 90;

/** Keep a season running: when the current one has ended, open the next
 *  with the same tiers and rewards, so match and ad XP never land nowhere.
 *  Idempotent (upserts on the unique season_number), safe on every boot. */
export async function ensureActiveSeason(now = new Date()): Promise<number | null> {
    if (await getCurrentSeason(now)) return null;
    const seasons = col<SeasonDoc>('battle_pass_seasons');
    const last = await seasons.findOne({}, { sort: { season_number: -1 }, projection: SEASON_PROJECTION });
    if (!last) return null;
    const n = last.season_number + 1;
    await seasons.updateOne(
        { season_number: n },
        { $setOnInsert: { season_number: n, name: `Season ${n}`, starts_at: now, ends_at: new Date(now.getTime() + SEASON_DAYS * 86_400_000), xp_per_tier: last.xp_per_tier, max_tier: last.max_tier } },
        { upsert: true }
    );
    const rewards = await col<RewardDoc>('battle_pass_rewards').find({ season_number: last.season_number }, { projection: { _id: 0 } }).toArray();
    if (rewards.length > 0) {
        await col('battle_pass_rewards').bulkWrite(rewards.map((r) => ({
            updateOne: { filter: { season_number: n, tier: r.tier, track: r.track }, update: { $setOnInsert: { ...r, season_number: n } }, upsert: true },
        })), { ordered: false });
    }
    return n;
}

export async function getCurrentSeason(now = new Date()): Promise<SeasonRow | null> {
    return col<SeasonDoc>('battle_pass_seasons').findOne(
        { starts_at: { $lte: now }, ends_at: { $gte: now } },
        { sort: { season_number: -1 }, projection: SEASON_PROJECTION }
    ) as Promise<SeasonRow | null>;
}

export async function awardMatchXp(args: {
    userId: string;
    result: 'win' | 'loss' | 'tie';
    forfeited?: boolean;
    guessed?: boolean;
}): Promise<{ xpAwarded: number; newXp: number; newTier: number; boosted: boolean }> {
    const baseAward = xpForMatch(args.result, { forfeited: args.forfeited ?? false, guessed: args.guessed ?? true });
    const season = baseAward > 0 ? await getCurrentSeason() : null;
    if (!season) {
        return { xpAwarded: 0, newXp: 0, newTier: 0, boosted: false };
    }
    const users = col<UserBpDoc>('users');
    const u = await users.findOne(
        { id: args.userId },
        { projection: { battle_pass_season: 1, xp_boost_until: 1 } }
    );
    if (!u) throw new Error('User not found');
    // XP Booster (coin purchase): double match XP while active.
    const boosted = u.xp_boost_until != null && u.xp_boost_until > new Date();
    const xpAwarded = boosted ? baseAward * 2 : baseAward;

    // Same season: atomic $inc. Old season: reset progress + premium first.
    const sameSeason = u.battle_pass_season === season.season_number;
    const updated = await users.findOneAndUpdate(
        { id: args.userId },
        sameSeason
            ? { $inc: { battle_pass_xp: xpAwarded }, $set: { updated_at: new Date() } }
            : {
                  $set: {
                      battle_pass_xp: xpAwarded,
                      battle_pass_premium: false,
                      battle_pass_season: season.season_number,
                      updated_at: new Date(),
                  },
              },
        { returnDocument: 'after', projection: { battle_pass_xp: 1 } }
    );
    const newXp = updated?.battle_pass_xp ?? xpAwarded;
    const newTier = Math.min(Math.floor(newXp / season.xp_per_tier), season.max_tier);
    return { xpAwarded, newXp, newTier, boosted };
}

export interface BattlePassRewardRow {
    tier: number;
    track: 'free' | 'premium';
    cosmetic_id: string | null;
    cosmetic_name: string | null;
    cosmetic_category: string | null;
}

interface RewardDoc {
    season_number: number;
    tier: number;
    track: 'free' | 'premium';
    cosmetic_id: string | null;
}

export async function listSeasonRewards(seasonNumber: number): Promise<BattlePassRewardRow[]> {
    // Join the cosmetics catalog so the client can show a friendly name +
    // category (and pick a preview) instead of the raw cosmetic id.
    const rewards = await col<RewardDoc>('battle_pass_rewards')
        .find({ season_number: seasonNumber }, { projection: { _id: 0 } })
        .sort({ tier: 1, track: 1 })
        .toArray();
    const ids = rewards.map((r) => r.cosmetic_id).filter((id): id is string => !!id);
    const cosmetics = await col<{ id: string; name: string; category: string }>('cosmetics')
        .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, name: 1, category: 1 } })
        .toArray();
    const byId = new Map(cosmetics.map((c) => [c.id, c]));
    return rewards.map((r) => {
        const c = r.cosmetic_id ? byId.get(r.cosmetic_id) : undefined;
        return {
            tier: r.tier,
            track: r.track,
            cosmetic_id: r.cosmetic_id,
            cosmetic_name: c?.name ?? null,
            cosmetic_category: c?.category ?? null,
        };
    });
}

export async function listClaims(
    userId: string,
    seasonNumber: number
): Promise<{ tier: number; track: 'free' | 'premium' }[]> {
    return col<{ tier: number; track: 'free' | 'premium' }>('battle_pass_claims')
        .find(
            { user_id: userId, season_number: seasonNumber },
            { projection: { _id: 0, tier: 1, track: 1 } }
        )
        .toArray();
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
    // Confirm the user has crossed this tier and (for premium) has unlocked.
    const u = await col<UserBpDoc>('users').findOne(
        { id: args.userId },
        { projection: { battle_pass_xp: 1, battle_pass_premium: 1, battle_pass_season: 1 } }
    );
    if (!u) return { granted: false, cosmeticId: null, error: 'User not found' };

    const s = await col<SeasonDoc>('battle_pass_seasons').findOne(
        { season_number: args.seasonNumber },
        { projection: { xp_per_tier: 1, max_tier: 1 } }
    );
    if (!s) return { granted: false, cosmeticId: null, error: 'Unknown season' };

    // Make sure the user is on this season; otherwise their XP is from
    // a different season.
    if (u.battle_pass_season !== args.seasonNumber) {
        return { granted: false, cosmeticId: null, error: 'Not your active season' };
    }
    if (args.track === 'premium' && !u.battle_pass_premium) {
        return { granted: false, cosmeticId: null, error: 'Premium track not unlocked' };
    }
    const earnedTier = Math.floor(u.battle_pass_xp / s.xp_per_tier);
    if (args.tier > earnedTier || args.tier > s.max_tier || args.tier < 1) {
        return { granted: false, cosmeticId: null, error: 'Tier not yet reached' };
    }

    // What's the reward?
    const reward = await col<RewardDoc>('battle_pass_rewards').findOne(
        { season_number: args.seasonNumber, tier: args.tier, track: args.track },
        { projection: { cosmetic_id: 1 } }
    );
    const cosmeticId = reward?.cosmetic_id ?? null;

    // Already claimed? The unique index is the guard.
    try {
        await col('battle_pass_claims').insertOne({
            user_id: args.userId,
            season_number: args.seasonNumber,
            tier: args.tier,
            track: args.track,
            claimed_at: new Date(),
        });
    } catch (err) {
        if ((err as { code?: number }).code === 11000) {
            return { granted: false, cosmeticId: null, error: 'Already claimed' };
        }
        throw err;
    }
    if (cosmeticId) {
        await grantCosmetic(args.userId, cosmeticId, 'battle_pass');
    }
    return { granted: true, cosmeticId };
}

/**
 * Mark the user as having unlocked the current season's premium track. The
 * actual payment happens client-side via an IAP — server should verify the
 * receipt before calling this. We accept the call as-is in dev.
 */
export async function unlockPremium(userId: string, _existing?: unknown): Promise<void> {
    // The IAP receipt is verified upstream in routes/battlepass.ts
    // (verifyIapPurchase) before this runs.
    const season = await getCurrentSeason();
    if (!season) throw new Error('No active season');
    const users = col<UserBpDoc>('users');
    // Old season → XP resets to 0 (two ops; the second is the real unlock).
    await users.updateOne(
        { id: userId, battle_pass_season: { $ne: season.season_number } },
        { $set: { battle_pass_xp: 0 } }
    );
    await users.updateOne(
        { id: userId },
        {
            $set: {
                battle_pass_premium: true,
                battle_pass_season: season.season_number,
                updated_at: new Date(),
            },
        }
    );
}
