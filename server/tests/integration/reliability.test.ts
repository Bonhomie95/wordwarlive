import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

// Uses only disposable test accounts and cleans up its transaction tombstones.
describe.skipIf(!process.env.DATABASE_URL)('purchase and inventory reliability', () => {
    const ids: string[] = [];
    const txns: string[] = [];
    let pool: typeof import('../../src/db/pool.js').pool;
    async function player() {
        ({ pool } = await import('../../src/db/pool.js'));
        const { createUser } = await import('../../src/services/userService.js');
        const tag = randomUUID().slice(0, 8);
        const u = await createUser({ username: `qa_${tag}`, provider: 'anonymous', subject: `qa-${randomUUID()}` });
        ids.push(u.id);
        return u.id;
    }
    afterAll(async () => {
        if (!pool) return;
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
        await pool.query('DELETE FROM iap_transactions WHERE transaction_id = ANY($1::text[])', [txns]);
        await pool.end();
    });

    it('rolls back the receipt and coins together, then retries exactly once', async () => {
        const userId = await player();
        const { verifyIapPurchase } = await import('../../src/iap/verify.js');
        const { grantCoins, getCoinBalance } = await import('../../src/services/coinsService.js');
        const transactionId = `qa-${randomUUID()}`;
        txns.push(transactionId);
        const args = { userId, productId: 'qa.coins', entitlement: 'coins:qa', platform: 'ios', transactionId };
        await expect(verifyIapPurchase(args, async (client) => {
            await grantCoins({ userId, amount: 100, source: 'iap' }, client);
            throw new Error('Injected failure after granting');
        })).rejects.toThrow('Injected failure');
        expect(await getCoinBalance(userId)).toBe(0);
        expect((await pool.query('SELECT 1 FROM iap_transactions WHERE transaction_id = $1', [transactionId])).rowCount).toBe(0);
        const results = await Promise.all(Array.from({ length: 8 }, () => verifyIapPurchase(args, async (client) => {
            await grantCoins({ userId, amount: 100, source: 'iap' }, client);
        })));
        expect(results.filter((r) => r.ok && !r.alreadyGranted)).toHaveLength(1);
        expect(await getCoinBalance(userId)).toBe(100);
        expect((await pool.query("SELECT 1 FROM coin_grants WHERE user_id = $1 AND source = 'iap'", [userId])).rowCount).toBe(1);
        const wrongProduct = await verifyIapPurchase({ ...args, productId: 'qa.other' });
        expect(wrongProduct.ok).toBe(false);
    });

    it('does not permit delete-and-recreate receipt replay', async () => {
        const userId = await player();
        const other = await player();
        const { verifyIapPurchase } = await import('../../src/iap/verify.js');
        const transactionId = `qa-${randomUUID()}`;
        txns.push(transactionId);
        const args = { userId, productId: 'qa.remove_ads', entitlement: 'remove_ads', platform: 'ios', transactionId };
        await verifyIapPurchase(args);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        const replay = await verifyIapPurchase({ ...args, userId: other });
        expect(replay.ok).toBe(false);
        if (!replay.ok) expect(replay.status).toBe(409);
    });

    it('concurrent cosmetic purchases charge only once and shield purchases respect the cap', async () => {
        const userId = await player();
        const { grantCoins, getCoinBalance } = await import('../../src/services/coinsService.js');
        const { purchaseCosmeticWithCoins, getCosmetic } = await import('../../src/services/cosmeticsService.js');
        const { buyStreakShield, STREAK_SHIELD_COST } = await import('../../src/services/boostsService.js');
        await grantCoins({ userId, amount: 5000, source: 'admin_grant' });
        const price = (await getCosmetic('avatar_fox_01'))!.price_coins;
        const cosmetics = await Promise.all(Array.from({ length: 6 }, () => purchaseCosmeticWithCoins(userId, 'avatar_fox_01')));
        expect(cosmetics.filter((r) => r.ok)).toHaveLength(1);
        const shields = await Promise.all(Array.from({ length: 6 }, () => buyStreakShield(userId)));
        expect(shields.filter((r) => r.ok)).toHaveLength(2);
        expect(await getCoinBalance(userId)).toBe(5000 - price - 2 * STREAK_SHIELD_COST);
    });

    it('concurrent hints respect the cap and never reveal the same position twice', async () => {
        const userId = await player();
        const { redeemHint } = await import('../../src/services/hintService.js');
        const { grantCoins, getCoinBalance } = await import('../../src/services/coinsService.js');
        await grantCoins({ userId, amount: 500, source: 'admin_grant' });
        const args = { userId, matchId: `qa-${randomUUID()}`, target: 'NOTEBOOK', history: [] };
        const results = await Promise.all(Array.from({ length: 5 }, () => redeemHint(args)));
        const success = results.filter((r) => r.ok);
        expect(success).toHaveLength(2);
        expect(new Set(success.map((r) => r.position)).size).toBe(2);
        expect(await getCoinBalance(userId)).toBe(450);
    });

    it('resets stale premium on season rollover and preserves current-season XP on upgrade', async () => {
        const userId = await player();
        const { getCurrentSeason, awardMatchXp, unlockPremium } = await import('../../src/services/battlePassService.js');
        const season = await getCurrentSeason();
        expect(season).not.toBeNull();
        await pool.query('UPDATE users SET battle_pass_season = 0, battle_pass_xp = 900, battle_pass_premium = true WHERE id = $1', [userId]);
        await awardMatchXp({ userId, result: 'win' });
        let u = (await pool.query('SELECT battle_pass_xp, battle_pass_premium FROM users WHERE id = $1', [userId])).rows[0];
        expect(u).toEqual({ battle_pass_xp: 60, battle_pass_premium: false });
        await unlockPremium(userId);
        u = (await pool.query('SELECT battle_pass_xp, battle_pass_premium FROM users WHERE id = $1', [userId])).rows[0];
        expect(u).toEqual({ battle_pass_xp: 60, battle_pass_premium: true });
    });

    it('serializes rank season resets and updates the displayed tier without raising low ranks', async () => {
        const userId = await player();
        const { getCurrentSeason, applyResetIfNeeded } = await import('../../src/services/rankSeasonService.js');
        const { tierFromPoints } = await import('../../src/game/ranks.js');
        const season = await getCurrentSeason();
        expect(season).not.toBeNull();
        await pool.query("UPDATE users SET rank_points = 1500, rank_tier = 'gold', last_rank_season_reset_id = NULL WHERE id = $1", [userId]);
        const results = await Promise.all(Array.from({ length: 6 }, () => applyResetIfNeeded(userId)));
        expect(results.filter((r) => r.resetApplied)).toHaveLength(1);
        const expected = Math.min(1500, Math.max(1000, 1500 - season!.softResetDelta));
        expect((await pool.query('SELECT rank_points, rank_tier FROM users WHERE id = $1', [userId])).rows[0]).toEqual({ rank_points: expected, rank_tier: tierFromPoints(expected) });
        await pool.query("UPDATE users SET rank_points = 850, rank_tier = 'stone', last_rank_season_reset_id = NULL WHERE id = $1", [userId]);
        await applyResetIfNeeded(userId);
        expect((await pool.query('SELECT rank_points FROM users WHERE id = $1', [userId])).rows[0].rank_points).toBe(850);
    });

    it('includes owned exclusive cosmetics in the equip catalog', async () => {
        const userId = await player();
        const { grantCosmetic, listShopCosmetics } = await import('../../src/services/cosmeticsService.js');
        await grantCosmetic(userId, 'border_legend', 'grant');
        expect((await listShopCosmetics(userId)).some((c) => c.id === 'border_legend')).toBe(true);
    });
});
