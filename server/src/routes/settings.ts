// User settings (sound, haptics, color-blind mode).

import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { getSettings, updateSettings } from '../services/settingsService.js';

export const settingsRouter = Router();

settingsRouter.get('/settings', requireAuth, async (req, res) => {
    const s = await getSettings(req.session!.userId);
    res.json(s);
});

settingsRouter.patch('/settings', requireAuth, async (req, res) => {
    const patch = req.body ?? {};
    const next = await updateSettings(req.session!.userId, patch);
    res.json(next);
});
