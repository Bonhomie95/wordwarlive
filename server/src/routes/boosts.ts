//   POST /api/boosts/streak-shield   buy one shield (coins)
//   POST /api/boosts/xp              buy 24h of 2x battle-pass XP (coins)
import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { buyStreakShield, buyXpBoost } from '../services/boostsService.js';

export const boostsRouter = Router();

const STATUS: Record<string, number> = { NOT_AFFORDABLE: 402, AT_MAX: 409, NOT_FOUND: 404 };
const MESSAGE: Record<string, string> = {
    NOT_AFFORDABLE: 'Not enough coins.',
    AT_MAX: 'You already hold the maximum number of shields.',
    NOT_FOUND: 'User not found',
};

boostsRouter.post('/boosts/streak-shield', requireAuth, async (req, res) => {
    const r = await buyStreakShield(req.session!.userId);
    if (!r.ok) return res.status(STATUS[r.error] ?? 400).json({ error: MESSAGE[r.error], code: r.error });
    res.json(r);
});

boostsRouter.post('/boosts/xp', requireAuth, async (req, res) => {
    const r = await buyXpBoost(req.session!.userId);
    if (!r.ok) return res.status(STATUS[r.error] ?? 400).json({ error: MESSAGE[r.error], code: r.error });
    res.json(r);
});
