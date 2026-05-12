// GET /api/leaderboard?period=daily|weekly|monthly|all_time&limit=50
//
// Returns top-N entries plus the requesting user's own rank within the
// same bucket (if they've played in that period).

import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
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

leaderboardRouter.get('/leaderboard', requireAuth, async (req, res) => {
    const periodParam = String(req.query.period ?? 'all_time') as LeaderboardPeriod;
    if (!VALID_PERIODS.includes(periodParam)) {
        return res.status(400).json({
            error: `Invalid period. Use one of: ${VALID_PERIODS.join(', ')}`,
        });
    }
    const limitParam = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;

    const data = await getLeaderboard({
        period: periodParam,
        limit,
        requesterId: req.session!.userId,
    });
    res.json(data);
});
