import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { query } from '../db/pool.js';
import { redis } from '../db/redis.js';
export const productEventsRouter = Router();
const schema = z.object({
    event: z.enum([
        'shop_view',
        'offer_view',
        'purchase_attempt',
        'purchase_completed',
        'tutorial_started',
        'tutorial_completed',
        'tutorial_skipped',
    ]),
    offer: z.string().max(100).default(''),
});
productEventsRouter.post('/events', requireAuth, async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid event' });
    const user = req.session!.userId;
    const key = `events:${user}:${Math.floor(Date.now() / 60000)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 120);
    if (n > 30) return res.status(429).json({ error: 'Too many events' });
    await query(
        "INSERT INTO product_events(user_id,event,offer) SELECT id,$2,$3 FROM users WHERE id=$1 AND auth_subject NOT LIKE 'bot-%' AND NOT banned",
        [user, parsed.data.event, parsed.data.offer],
    );
    res.json({ ok: true });
});
