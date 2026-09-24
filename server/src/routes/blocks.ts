// Block / unblock endpoints (App Store UGC requirement).
//   GET    /api/blocks           list the users you've blocked
//   POST   /api/blocks           { targetId }  block a user
//   DELETE /api/blocks/:id       unblock a user

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { findUserById } from '../services/userService.js';
import { blockUser, unblockUser, listBlocked } from '../services/blocksService.js';

export const blocksRouter = Router();

blocksRouter.get('/blocks', requireAuth, async (req, res) => {
    res.json({ blocked: await listBlocked(req.session!.userId) });
});

const blockSchema = z.object({ targetId: z.string().uuid() });

blocksRouter.post('/blocks', requireAuth, async (req, res) => {
    const parsed = blockSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid target' });
    const target = await findUserById(parsed.data.targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const result = await blockUser(req.session!.userId, parsed.data.targetId);
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true });
});

blocksRouter.delete('/blocks/:id', requireAuth, async (req, res) => {
    await unblockUser(req.session!.userId, String(req.params.id));
    res.json({ ok: true });
});
