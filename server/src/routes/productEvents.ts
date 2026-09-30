import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { col, newId, registerIndexes } from '../db/mongo.js';
import { redis } from '../db/redis.js';

registerIndexes('product_events', [
    { key: { id: 1 }, unique: true },
    { key: { created_at: 1, event: 1 } },
]);

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
    // Only record for real (non-bot, non-banned) users.
    const eligible = await col('users').findOne(
        { id: user, auth_subject: { $not: /^bot-/ }, banned: { $ne: true } },
        { projection: { _id: 1 } }
    );
    if (eligible) {
        await col('product_events').insertOne({
            id: newId(),
            user_id: user,
            event: parsed.data.event,
            offer: parsed.data.offer,
            created_at: new Date(),
        });
    }
    res.json({ ok: true });
});
