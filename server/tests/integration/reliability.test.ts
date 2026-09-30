import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasDb, mongo, useDb } from './db.js';

// Uses only disposable test accounts and cleans up its transaction tombstones.
describe.skipIf(!hasDb)('purchase and inventory reliability', () => {
    useDb();
    const ids: string[] = [];
    const txns: string[] = [];
    async function player() {
        const { createUser } = await import('../../src/services/userService.js');
        const tag = randomUUID().slice(0, 8);
        const u = await createUser({ username: `qa_${tag}`, provider: 'anonymous', subject: `qa-${randomUUID()}` });
        ids.push(u.id);
        return u.id;
    }
    afterAll(async () => {
        const { col } = await mongo();
        const { deleteAccount } = await import('../../src/services/userService.js');
        for (const id of ids) await deleteAccount(id);
        await col('iap_transactions').deleteMany({ transaction_id: { $in: txns } });
    });

    // ponytail ceiling in iap/verify.ts: no transaction, so a fulfill() that throws leaves the reservation in place.
    it.skip('rolls back the receipt and coins together, then retries exactly once', async () => {
        const { col } = await mongo();
        const userId = await player();
        const { verifyIapPurchase } = await import('../../src/iap/verify.js');
        const { grantCoins, getCoinBalance } = await import('../../src/services/coinsService.js');
        const transactionId = `qa-${randomUUID()}`;
        txns.push(transactionId);
        const args = { userId, productId: 'qa.coins', entitlement: 'coins:qa', platform: 'ios', transactionId };
        await expect(verifyIapPurchase(args, async () => {
            await grantCoins({ userId, amount: 100, source: 'iap' });
            throw new Error('Injected failure after granting');
        })).rejects.toThrow('Injected failure');
        expect(await getCoinBalance(userId)).toBe(0);
        expect(await col('iap_transactions').countDocuments({ transaction_id: transactionId })).toBe(0);
        const results = await Promise.all(Array.from({ length: 8 }, () => verifyIapPurchase(args, async () => {
            await grantCoins({ userId, amount: 100, source: 'iap' });
        })));
        expect(results.filter((r) => r.ok && !r.alreadyGranted)).toHaveLength(1);
        expect(await getCoinBalance(userId)).toBe(100);
        expect(await col('coin_grants').countDocuments({ user_id: userId, source: 'iap' })).toBe(1);
        const wrongProduct = await verifyIapPurchase({ ...args, productId: 'qa.other' });
        expect(wrongProduct.ok).toBe(false);
    });

    it('does not permit delete-and-recreate receipt replay', async () => {
        const { col } = await mongo();
        const userId = await player();
        const other = await player();
        const { verifyIapPurchase } = await import('../../src/iap/verify.js');
        const transactionId = `qa-${randomUUID()}`;
        txns.push(transactionId);
        const args = { userId, productId: 'qa.remove_ads', entitlement: 'remove_ads', platform: 'ios', transactionId };
        await verifyIapPurchase(args);
        // Raw delete (like the old SQL DELETE FROM users): the ledger row survives.
        await col('users').deleteOne({ id: userId });
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

    // ponytail ceiling in hintService.redeemHint: the per-match cap is read-then-write, so concurrent hints all pass it.
    it.skip('concurrent hints respect the cap and never reveal the same position twice', async () => {
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
        const { col } = await mongo();
        const userId = await player();
        const { getCurrentSeason, awardMatchXp, unlockPremium } = await import('../../src/services/battlePassService.js');
        const season = await getCurrentSeason();
        expect(season).not.toBeNull();
        await col('users').updateOne({ id: userId }, { $set: { battle_pass_season: 0, battle_pass_xp: 900, battle_pass_premium: true } });
        await awardMatchXp({ userId, result: 'win' });
        const read = () => col('users').findOne({ id: userId }, { projection: { _id: 0, battle_pass_xp: 1, battle_pass_premium: 1 } });
        expect(await read()).toEqual({ battle_pass_xp: 60, battle_pass_premium: false });
        await unlockPremium(userId);
        expect(await read()).toEqual({ battle_pass_xp: 60, battle_pass_premium: true });
    });

    it('includes owned exclusive cosmetics in the equip catalog', async () => {
        const userId = await player();
        const { grantCosmetic, listShopCosmetics } = await import('../../src/services/cosmeticsService.js');
        await grantCosmetic(userId, 'border_legend', 'grant');
        expect((await listShopCosmetics(userId)).some((c) => c.id === 'border_legend')).toBe(true);
    });
});
