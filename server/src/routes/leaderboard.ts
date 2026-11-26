// GET /api/leaderboard?period=daily|weekly|monthly|all_time&limit=50[&around=1]
//
// Returns top-N entries plus the requesting user's own rank within the
// same bucket (if they've played in that period), and the prizes the top
// 100 win when the bucket closes (none for all_time).
//
// GET  /api/rewards/pending   leaderboard prizes the player hasn't seen yet
// POST /api/rewards/seen      { ids: string[] } — dismissed in the app

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import {
    currentEndsAt,
    markRewardsSeen,
    pendingRewards,
    prizeTable,
} from '../services/leaderboardRewardsService.js';
import {
    getLeaderboard,
    type LeaderboardPeriod,
} from '../services/leaderboardService.js';

export const leaderboardRouter = Router();

const VALID_PERIODS: readonly LeaderboardPeriod[] = [
    'daily',
    'weekly',
    'monthly',
    'all_time',
] as const;
const VALID_MODES = ['classic', 'mystery', 'overall'] as const;
type LeaderboardMode = (typeof VALID_MODES)[number];

leaderboardRouter.get('/leaderboard', requireAuth, async (req, res) => {
    const periodParam = String(req.query.period ?? 'all_time') as LeaderboardPeriod;
    if (!VALID_PERIODS.includes(periodParam)) {
        return res.status(400).json({
            error: `Invalid period. Use one of: ${VALID_PERIODS.join(', ')}`,
        });
    }
    const modeParam = String(req.query.mode ?? 'overall') as LeaderboardMode;
    if (!VALID_MODES.includes(modeParam)) {
        return res.status(400).json({
            error: `Invalid mode. Use one of: ${VALID_MODES.join(', ')}`,
        });
    }
    const limitParam = Number(req.query.limit ?? 50);
    // Whole numbers only: each distinct limit is its own cache key.
    const limit = Number.isFinite(limitParam) && limitParam >= 1 ? Math.floor(limitParam) : 50;

    const data = await getLeaderboard({
        period: periodParam,
        mode: modeParam,
        limit,
        requesterId: req.session!.userId,
        around: req.query.around === '1' || req.query.around === 'true',
    });
    const board = periodParam === 'all_time' ? null : periodParam;
    res.json({
        ...data,
        prizes: board ? prizeTable(board) : [],
        endsAt: board ? currentEndsAt(board).toISOString() : null,
    });
});

leaderboardRouter.get('/rewards/pending', requireAuth, async (req, res) => {
    res.json({ rewards: await pendingRewards(req.session!.userId) });
});

const seenSchema = z.object({ ids: z.array(z.string().max(64)).max(50) });

leaderboardRouter.post('/rewards/seen', requireAuth, async (req, res) => {
    const parsed = seenSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    await markRewardsSeen(req.session!.userId, parsed.data.ids);
    res.json({ ok: true });
});
