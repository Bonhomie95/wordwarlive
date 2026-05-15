// Replay endpoints.
//
//   GET /api/replays            — your recent matches
//   GET /api/replays/:matchId   — full replay data (your perspective)

import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { getReplay, listReplaysForUser } from '../services/replayService.js';

export const replaysRouter = Router();

replaysRouter.get('/replays', requireAuth, async (req, res) => {
    const replays = await listReplaysForUser(req.session!.userId, 20);
    res.json({ replays });
});

replaysRouter.get('/replays/:matchId', requireAuth, async (req, res) => {
    const replay = await getReplay(req.session!.userId, req.params.matchId!);
    if (!replay) return res.status(404).json({ error: 'Not found' });
    res.json(replay);
});
