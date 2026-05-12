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
    fulfillCoinPackPurchase,
} from '../services/coinsService.js';
import { findUserById } from '../services/userService.js';
import { MILESTONES, nextMilestone } from '../services/streakService.js';

export const coinsRouter = Router();

coinsRouter.get('/coins/packs', (_req, res) => {
    res.json({
        packs: COIN_PACKS,
        hintCost: HINT_COIN_COST,
    });
});

const purchaseSchema = z.object({
    receipt: z.string().optional(),
});

coinsRouter.post('/coins/packs/:id/purchase', requireAuth, async (req, res) => {
    const id = req.params.id ?? '';
    const parsed = purchaseSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

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
    const next = nextMilestone(u.play_streak);
    res.json({
        playStreak: u.play_streak,
        playStreakBest: u.play_streak_best,
        lastPlayDate: u.last_play_date
            ? new Date(u.last_play_date).toISOString().slice(0, 10)
            : null,
        milestones: MILESTONES,
        nextMilestone: next,
    });
});
