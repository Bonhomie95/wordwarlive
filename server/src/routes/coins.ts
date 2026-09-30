// Coin pack routes.
//   GET  /api/coins/packs                public catalog (no auth)
//   POST /api/coins/packs/:id/purchase   authenticated, fulfills purchase
//   GET  /api/streak                     authenticated, current play-streak state

import { Router } from 'express';
import { z } from 'zod';
import { col } from '../db/mongo.js';
import { requireAuth } from '../auth/middleware.js';
import {
    COIN_PACKS,
    HINT_COIN_COST,
    STARTER_BUNDLE,
    getCoinBalance,
    grantCoins,
} from '../services/coinsService.js';
import { grantCosmetic } from '../services/cosmeticsService.js';
import { findUserById } from '../services/userService.js';
import { effectiveStreak, MILESTONES, nextMilestone } from '../services/streakService.js';
import { STARTER_BUNDLE_PRODUCT_ID, verifyIapPurchase } from '../iap/verify.js';

export const coinsRouter = Router();

coinsRouter.get('/coins/packs', (_req, res) => {
    res.json({
        packs: COIN_PACKS,
        hintCost: HINT_COIN_COST,
        starterBundle: STARTER_BUNDLE,
    });
});

/** One-time Starter Bundle: coins + two cosmetics for a low first price. */
coinsRouter.post('/coins/bundles/starter/purchase', requireAuth, async (req, res) => {
    const parsed = purchaseSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const userId = req.session!.userId;

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });


    const verified = await verifyIapPurchase({
        userId, productId: STARTER_BUNDLE_PRODUCT_ID, entitlement: 'bundle:starter', ...parsed.data,
    }, async () => {
        // Atomic claim: only the first store transaction flips starter_bundle_at, so the bundle can't double-grant.
        const now = new Date();
        const claimed = await col('users').updateOne(
            { id: userId, starter_bundle_at: null },
            { $set: { starter_bundle_at: now, updated_at: now } }
        );
        if (!claimed.matchedCount) return;
        for (const id of STARTER_BUNDLE.cosmeticIds) await grantCosmetic(userId, id, 'purchase');
        await grantCoins({ userId, amount: STARTER_BUNDLE.coins, source: 'bundle', metadata: { productId: STARTER_BUNDLE.productId } });
    });
    if (!verified.ok) return res.status(verified.status).json({ error: verified.error });
    res.json({ ok: true, newBalance: await getCoinBalance(userId) });
});

const purchaseSchema = z.object({
    receipt: z.string().optional(),
    platform: z.enum(['ios', 'android']).optional(),
    transactionId: z.string().optional(),
});

coinsRouter.post('/coins/packs/:id/purchase', requireAuth, async (req, res) => {
    const id = String(req.params.id ?? '');
    const parsed = purchaseSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const pack = COIN_PACKS.find((p) => p.id === id);
    if (!pack) return res.status(404).json({ error: 'Unknown pack' });

    const verified = await verifyIapPurchase({
        userId: req.session!.userId,
        productId: pack.productId,
        entitlement: `coins:${pack.id}`,
        platform: parsed.data.platform,
        receipt: parsed.data.receipt,
        transactionId: parsed.data.transactionId,
    }, async () => {
        await grantCoins({ userId: req.session!.userId, amount: pack.coins, source: 'iap', metadata: { packId: pack.id, productId: pack.productId } });
    });
    if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
    }
    res.json({ ok: true, pack: { id: pack.id, name: pack.name, coins: pack.coins }, newBalance: await getCoinBalance(req.session!.userId) });
});

coinsRouter.get('/streak', requireAuth, async (req, res) => {
    const u = await findUserById(req.session!.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const effective = effectiveStreak(u.play_streak, u.last_play_date, u.streak_shields);
    const next = nextMilestone(effective);
    res.json({
        playStreak: effective,
        playStreakBest: u.play_streak_best,
        lastPlayDate: u.last_play_date
            ? new Date(u.last_play_date).toISOString().slice(0, 10)
            : null,
        milestones: MILESTONES,
        nextMilestone: next,
    });
});
