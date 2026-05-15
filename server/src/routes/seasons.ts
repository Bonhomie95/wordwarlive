// Ranked season endpoints — get current season info + any pending reset
// result. The reset is applied lazily on /me; this endpoint just surfaces
// the metadata.

import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
    applyResetIfNeeded,
    getCurrentSeason,
} from '../services/rankSeasonService.js';

export const seasonsRouter = Router();

seasonsRouter.get('/seasons/current', requireAuth, async (req, res) => {
    const season = await getCurrentSeason();
    // Triggers reset if needed; returns previous-season result if so.
    const reset = await applyResetIfNeeded(req.session!.userId);
    res.json({ season, reset });
});
