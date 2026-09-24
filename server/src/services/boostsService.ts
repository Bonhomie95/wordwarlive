// Coin-priced boosts. None of these touch match fairness — they only affect
// the player's own progression economy (streak safety, battle-pass XP).
//
//   Streak Shield  — 150 coins, hold up to 2. Each covers ONE missed day so
//                    the play streak survives (consumed in streakService).
//   XP Booster     — 250 coins, 2x battle-pass XP from matches for 24h
//                    (stacks by extending the end time).

import { query } from '../db/pool.js';
import { grantCoins, spendCoins } from './coinsService.js';

export const STREAK_SHIELD_COST = 150;
export const STREAK_SHIELD_MAX = 2;
export const XP_BOOST_COST = 250;
export const XP_BOOST_HOURS = 24;
export const XP_BOOST_MULTIPLIER = 2;

export type BoostError = 'NOT_AFFORDABLE' | 'AT_MAX' | 'NOT_FOUND';

export async function buyStreakShield(
    userId: string
): Promise<{ ok: true; shields: number; coins: number } | { ok: false; error: BoostError }> {
    const cur = await query<{ streak_shields: number }>(
        'SELECT streak_shields FROM users WHERE id = $1',
        [userId]
    );
    if (!cur[0]) return { ok: false, error: 'NOT_FOUND' };
    if (cur[0].streak_shields >= STREAK_SHIELD_MAX) return { ok: false, error: 'AT_MAX' };

    const coins = await spendCoins({
        userId,
        amount: STREAK_SHIELD_COST,
        source: 'boost_spend',
        metadata: { boost: 'streak_shield' },
    });
    if (coins === null) return { ok: false, error: 'NOT_AFFORDABLE' };

    // Conditional increment so two concurrent buys can't exceed the cap.
    const r = await query<{ streak_shields: number }>(
        `UPDATE users SET streak_shields = streak_shields + 1, updated_at = now()
         WHERE id = $1 AND streak_shields < $2 RETURNING streak_shields`,
        [userId, STREAK_SHIELD_MAX]
    );
    if (r.length === 0) {
        await grantCoins({ userId, amount: STREAK_SHIELD_COST, source: 'boost_spend', metadata: { refund: 'streak_shield' } });
        return { ok: false, error: 'AT_MAX' };
    }
    return { ok: true, shields: r[0]!.streak_shields, coins };
}

export async function buyXpBoost(
    userId: string
): Promise<{ ok: true; xpBoostUntil: string; coins: number } | { ok: false; error: BoostError }> {
    const coins = await spendCoins({
        userId,
        amount: XP_BOOST_COST,
        source: 'boost_spend',
        metadata: { boost: 'xp_boost', hours: XP_BOOST_HOURS },
    });
    if (coins === null) return { ok: false, error: 'NOT_AFFORDABLE' };
    const r = await query<{ xp_boost_until: Date }>(
        `UPDATE users
         SET xp_boost_until = GREATEST(COALESCE(xp_boost_until, now()), now()) + ($2 || ' hours')::interval,
             updated_at = now()
         WHERE id = $1 RETURNING xp_boost_until`,
        [userId, String(XP_BOOST_HOURS)]
    );
    if (!r[0]) return { ok: false, error: 'NOT_FOUND' };
    return { ok: true, xpBoostUntil: new Date(r[0].xp_boost_until).toISOString(), coins };
}
