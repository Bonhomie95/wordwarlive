import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { listRecentMatches } from '../services/matchService.js';

export const matchesRouter = Router();

matchesRouter.get('/matches/recent', requireAuth, async (req, res) => {
    const n = Math.floor(Number(req.query.limit ?? 25));
    const limit = Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 25;
    const rows = await listRecentMatches(req.session!.userId, limit);
    res.json({ matches: rows });
});
