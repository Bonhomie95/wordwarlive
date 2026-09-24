// Coin pack routes.
//   GET  /api/coins/packs                public catalog (no auth)
//   POST /api/coins/packs/:id/purchase   authenticated, fulfills purchase
//   GET  /api/streak                     authenticated, current play-streak state

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import {
    COIN_PACKS,
    HINT_COIN_COST,
    STARTER_BUNDLE,
    fulfillCoinPackPurchase,
    getCoinBalance,
    grantCoins,
} from '../services/coinsService.js';
import { grantCosmetic } from '../services/cosmeticsService.js';
import { findUserById } from '../services/userService.js';
import { query } from '../db/pool.js';
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
    if (user.starter_bundle_at) {
        return res.status(409).json({ error: 'You already own the Starter Bundle.' });
    }

    const verified = await verifyIapPurchase({
        userId,
        productId: STARTER_BUNDLE_PRODUCT_ID,
        entitlement: 'bundle:starter',
        platform: parsed.data.platform,
        receipt: parsed.data.receipt,
        transactionId: parsed.data.transactionId,
    });
    if (!verified.ok) return res.status(verified.status).json({ error: verified.error });
    if (verified.alreadyGranted) {
        return res.json({ ok: true, newBalance: await getCoinBalance(userId) });
    }

    // Mark first so a retry can't double-grant, then hand everything out.
    await query('UPDATE users SET starter_bundle_at = now(), updated_at = now() WHERE id = $1', [userId]);
    for (const id of STARTER_BUNDLE.cosmeticIds) await grantCosmetic(userId, id, 'purchase');
    const newBalance = await grantCoins({
        userId,
        amount: STARTER_BUNDLE.coins,
        source: 'bundle',
        metadata: { bundle: STARTER_BUNDLE.id, productId: STARTER_BUNDLE.productId },
    });
    res.json({ ok: true, newBalance });
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
    });
    if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
    }
    if (verified.alreadyGranted) {
        // Consumable replay from the same account (e.g. a retry after a dropped
        // response): never grant twice. Tell the client the current balance.
        return res.json({
            ok: true,
            pack: { id: pack.id, name: pack.name, coins: pack.coins },
            newBalance: await getCoinBalance(req.session!.userId),
        });
    }

    const result = await fulfillCoinPackPurchase({
        userId: req.session!.userId,
        packId: id,
        receipt: parsed.data.receipt,
    });
    if (!result) return res.status(404).json({ error: 'Unknown pack' });
    res.json({ ok: true, pack: result.pack, newBalance: result.newBalance });
});

coinsRouter.get('/streak', requireAuth, async (req, res) => {
    const u = await findUserById(req.session!.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const effective = effectiveStreak(u.play_streak, u.last_play_date);
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
