import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { listRecentMatches } from '../services/matchService.js';

export const matchesRouter = Router();

matchesRouter.get('/matches/recent', requireAuth, async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 25)));
    const rows = await listRecentMatches(req.session!.userId, limit);
    res.json({ matches: rows });
});
