// Push-token registration.
//
//   POST /api/push/register    { token, platform? }
//   POST /api/push/unregister  { token }

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { registerPushToken, removePushToken } from '../services/pushService.js';

export const pushRouter = Router();

const registerSchema = z.object({
    token: z.string().min(1).max(256),
    platform: z.enum(['ios', 'android']).optional(),
});

pushRouter.post('/push/register', requireAuth, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    await registerPushToken({
        userId: req.session!.userId,
        token: parsed.data.token,
        platform: parsed.data.platform,
    });
    res.json({ ok: true });
});

const unregisterSchema = z.object({ token: z.string().min(1).max(256) });

pushRouter.post('/push/unregister', requireAuth, async (req, res) => {
    const parsed = unregisterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    await removePushToken(parsed.data.token);
    res.json({ ok: true });
});
