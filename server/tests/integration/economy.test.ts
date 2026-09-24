// DB-backed checks for the coin economy added in the revenue pass:
// coin-priced cosmetics, Streak Shield, XP Booster, username rename.
// Self-skips without DATABASE_URL.

import { describe, it, expect, afterAll } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('coin economy (integration)', () => {
    let pool: typeof import('../../src/db/pool.js').pool;
    const created: string[] = [];

    afterAll(async () => {
        if (pool) {
            for (const id of created) await pool.query('DELETE FROM users WHERE id = $1', [id]);
            await pool.end();
        }
    });

    it('cosmetic with coins, shields, XP boost and rename all charge and grant correctly', async () => {
        ({ pool } = await import('../../src/db/pool.js'));
        const { createUser, changeUsername, findUserById } = await import('../../src/services/userService.js');
        const { grantCoins, getCoinBalance } = await import('../../src/services/coinsService.js');
        const { purchaseCosmeticWithCoins, ownsCosmetic, getCosmetic } = await import('../../src/services/cosmeticsService.js');
        const { buyStreakShield, buyXpBoost, STREAK_SHIELD_COST, XP_BOOST_COST, STREAK_SHIELD_MAX } = await import('../../src/services/boostsService.js');
        const { awardMatchXp, xpForMatch } = await import('../../src/services/battlePassService.js');

        const u = await createUser({
            username: `eco_${Date.now().toString(36).slice(-7)}`,
            provider: 'anonymous',
            subject: `eco-test-${Date.now()}-${Math.random()}`,
        });
        created.push(u.id);

        // Broke player can't buy.
        const fox = await getCosmetic('avatar_fox_01');
        expect(fox?.price_coins).toBeGreaterThan(0);
        expect(await purchaseCosmeticWithCoins(u.id, 'avatar_fox_01')).toEqual({ ok: false, error: 'NOT_AFFORDABLE' });

        await grantCoins({ userId: u.id, amount: 5000, source: 'admin_grant' });

        // Coin purchase grants + charges exactly the coin price; second buy refused.
        const buy = await purchaseCosmeticWithCoins(u.id, 'avatar_fox_01');
        expect(buy.ok).toBe(true);
        expect(await ownsCosmetic(u.id, 'avatar_fox_01')).toBe(true);
        expect(await getCoinBalance(u.id)).toBe(5000 - fox!.price_coins);
        expect(await purchaseCosmeticWithCoins(u.id, 'avatar_fox_01')).toEqual({ ok: false, error: 'ALREADY_OWNED' });

        // Shields cap at the max.
        let bal = await getCoinBalance(u.id);
        for (let i = 0; i < STREAK_SHIELD_MAX; i++) expect((await buyStreakShield(u.id)).ok).toBe(true);
        expect(await buyStreakShield(u.id)).toEqual({ ok: false, error: 'AT_MAX' });
        expect(await getCoinBalance(u.id)).toBe(bal - STREAK_SHIELD_COST * STREAK_SHIELD_MAX);

        // XP boost doubles match XP while active.
        bal = await getCoinBalance(u.id);
        const boost = await buyXpBoost(u.id);
        expect(boost.ok).toBe(true);
        expect(await getCoinBalance(u.id)).toBe(bal - XP_BOOST_COST);
        const xp = await awardMatchXp({ userId: u.id, result: 'win' });
        if (xp.newTier >= 0 && xp.xpAwarded > 0) {
            expect(xp.boosted).toBe(true);
            expect(xp.xpAwarded).toBe(xpForMatch('win') * 2);
        }

        // First rename is free, the second costs coins.
        bal = await getCoinBalance(u.id);
        expect(await changeUsername(u.id, `eco_a_${Date.now().toString(36).slice(-5)}`)).toEqual({ ok: true, coinsSpent: 0 });
        const second = await changeUsername(u.id, `eco_b_${Date.now().toString(36).slice(-5)}`);
        expect(second.ok && second.coinsSpent).toBe(300);
        expect(await getCoinBalance(u.id)).toBe(bal - 300);
        const fresh = await findUserById(u.id);
        expect(fresh?.username.startsWith('eco_b_')).toBe(true);
    });
});
