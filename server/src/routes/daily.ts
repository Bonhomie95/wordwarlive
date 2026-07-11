// Daily challenge endpoints.
//
//   GET  /api/daily        — today's metadata + my attempt
//   POST /api/daily/guess  — submit a guess
//   GET  /api/daily/board  — today's leaderboard

import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
    getMyAttempt,
    getMyDailyHints,
    getOrCreateTodaysChallenge,
    redeemDailyHint,
    submitGuess,
    todaysLeaderboard,
} from '../services/dailyChallengeService.js';

export const dailyRouter = Router();

dailyRouter.get('/daily', requireAuth, async (req, res) => {
    const challenge = await getOrCreateTodaysChallenge();
    const [attempt, hints] = await Promise.all([
        getMyAttempt(req.session!.userId),
        getMyDailyHints(req.session!.userId),
    ]);
    res.json({ challenge, attempt, hints });
});

dailyRouter.post('/daily/hint', requireAuth, async (req, res) => {
    const result = await redeemDailyHint(req.session!.userId);
    if (!result.ok) {
        const status =
            result.error === 'NOT_AFFORDABLE' ? 402 :
            result.error === 'PER_MATCH_LIMIT' || result.error === 'ALREADY_SOLVED' ? 409 :
            400;
        return res.status(status).json(result);
    }
    res.json(result);
});

dailyRouter.post('/daily/guess', requireAuth, async (req, res) => {
    const guess = String(req.body?.guess ?? '');
    if (!guess) return res.status(400).json({ error: 'Missing guess' });
    const result = await submitGuess(req.session!.userId, guess);
    if (!result.ok) {
        return res
            .status(result.errorCode === 'ALREADY_SOLVED' ? 409 : 400)
            .json(result);
    }
    res.json(result);
});

dailyRouter.get('/daily/board', requireAuth, async (_req, res) => {
    const entries = await todaysLeaderboard(50);
    res.json({ entries });
});
