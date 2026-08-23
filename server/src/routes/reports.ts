// Report endpoint.
//
//   POST /api/reports   — file a report about a user / mystery word / match
//
// Intake only; moderation review happens out of band.

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { createReport } from '../services/reportService.js';

export const reportsRouter = Router();

const reportSchema = z.object({
    targetType: z.enum(['user', 'mystery_word', 'match']),
    targetId: z.string().max(128).optional(),
    reason: z.enum([
        'offensive_name',
        'offensive_word',
        'cheating',
        'harassment',
        'other',
    ]),
    detail: z.string().max(1000).optional(),
});

reportsRouter.post('/reports', requireAuth, async (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const result = await createReport({
        reporterId: req.session!.userId,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId ?? null,
        reason: parsed.data.reason,
        detail: parsed.data.detail ?? null,
    });
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true });
});
