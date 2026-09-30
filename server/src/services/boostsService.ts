// Coin-priced boosts. None of these touch match fairness — they only affect
// the player's own progression economy (streak safety, battle-pass XP).
//
//   Streak Shield  — 150 coins, hold up to 2. Each covers ONE missed day so
//                    the play streak survives (consumed in streakService).
//   XP Booster     — 250 coins, 2x battle-pass XP from matches for 24h
//                    (stacks by extending the end time).

import { col } from '../db/mongo.js';
import { spendCoins } from './coinsService.js';

export const STREAK_SHIELD_COST = 150;
export const STREAK_SHIELD_MAX = 2;
export const XP_BOOST_COST = 250;
export const XP_BOOST_HOURS = 24;
export const XP_BOOST_MULTIPLIER = 2;

export type BoostError = 'NOT_AFFORDABLE' | 'AT_MAX' | 'NOT_FOUND';

export async function buyStreakShield(userId: string): Promise<{ ok: true; shields: number; coins: number } | { ok: false; error: BoostError }> {
    const users = col<{ id: string; streak_shields: number }>('users');
    const cur = await users.findOne({ id: userId }, { projection: { _id: 0, streak_shields: 1 } });
    if (!cur) return { ok: false, error: 'NOT_FOUND' };
    if (cur.streak_shields >= STREAK_SHIELD_MAX) return { ok: false, error: 'AT_MAX' };
    const coins = await spendCoins({ userId, amount: STREAK_SHIELD_COST, source: 'boost_spend', metadata: { boost: 'streak_shield' } });
    if (coins === null) return { ok: false, error: 'NOT_AFFORDABLE' };
    // ponytail: no row lock — two concurrent buys can both pass the AT_MAX
    // check; the $lt filter keeps the count capped, the second buyer is refunded.
    const result = await users.findOneAndUpdate(
        { id: userId, streak_shields: { $lt: STREAK_SHIELD_MAX } },
        { $inc: { streak_shields: 1 }, $set: { updated_at: new Date() } },
        { returnDocument: 'after', projection: { _id: 0, streak_shields: 1 } }
    );
    if (!result) {
        await users.updateOne({ id: userId }, { $inc: { coins: STREAK_SHIELD_COST } });
        return { ok: false, error: 'AT_MAX' };
    }
    return { ok: true, shields: result.streak_shields, coins };
}

export async function buyXpBoost(userId: string): Promise<{ ok: true; xpBoostUntil: string; coins: number } | { ok: false; error: BoostError }> {
    const coins = await spendCoins({ userId, amount: XP_BOOST_COST, source: 'boost_spend', metadata: { boost: 'xp_boost', hours: XP_BOOST_HOURS } });
    if (coins === null) return { ok: false, error: 'NOT_AFFORDABLE' };
    // GREATEST(COALESCE(xp_boost_until, now()), now()) + 24h, atomically.
    const result = await col<{ xp_boost_until: Date }>('users').findOneAndUpdate(
        { id: userId },
        [{ $set: {
            xp_boost_until: { $add: [{ $max: [{ $ifNull: ['$xp_boost_until', '$$NOW'] }, '$$NOW'] }, XP_BOOST_HOURS * 3_600_000] },
            updated_at: '$$NOW',
        } }],
        { returnDocument: 'after', projection: { _id: 0, xp_boost_until: 1 } }
    );
    return { ok: true, xpBoostUntil: new Date(result!.xp_boost_until).toISOString(), coins };
}
