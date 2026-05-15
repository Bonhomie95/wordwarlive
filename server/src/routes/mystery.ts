// Mystery mode endpoints.
//
//   POST /api/mystery/submit       — submit your word
//   GET  /api/mystery/pending      — your current pending submission
//   POST /api/mystery/withdraw     — cancel your pending submission
//
// Actual matchmaking happens over the socket via 'mystery_queue' — see
// matchHandler.

import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
    getMyPendingSubmission,
    submitWord,
    withdrawSubmission,
} from '../services/mysteryService.js';

export const mysteryRouter = Router();

mysteryRouter.post('/mystery/submit', requireAuth, async (req, res) => {
    const word = String(req.body?.word ?? '');
    const result = await submitWord(req.session!.userId, word);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
});

mysteryRouter.get('/mystery/pending', requireAuth, async (req, res) => {
    const sub = await getMyPendingSubmission(req.session!.userId);
    res.json({ submission: sub });
});

mysteryRouter.post('/mystery/withdraw', requireAuth, async (req, res) => {
    await withdrawSubmission(req.session!.userId);
    res.json({ ok: true });
});
