import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import {
    claimTier,
    getCurrentSeason,
    listClaims,
    listSeasonRewards,
    unlockPremium,
} from '../services/battlePassService.js';
import { findUserById } from '../services/userService.js';

export const battlePassRouter = Router();

battlePassRouter.get('/battlepass/current', requireAuth, async (req, res) => {
    const season = await getCurrentSeason();
    if (!season) return res.json({ active: false });

    const [user, rewards, claims] = await Promise.all([
        findUserById(req.session!.userId),
        listSeasonRewards(season.season_number),
        listClaims(req.session!.userId, season.season_number),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // If the user is on a previous season, treat their XP as zero this season
    // for display purposes (they'll start fresh on the next match awarded).
    const xpForSeason =
        user.battle_pass_season === season.season_number ? user.battle_pass_xp : 0;
    const earnedTier = Math.min(
        Math.floor(xpForSeason / season.xp_per_tier),
        season.max_tier
    );
    const claimSet = new Set(claims.map((c) => `${c.tier}:${c.track}`));

    res.json({
        active: true,
        season: {
            seasonNumber: season.season_number,
            name: season.name,
            startsAt: season.starts_at,
            endsAt: season.ends_at,
            xpPerTier: season.xp_per_tier,
            maxTier: season.max_tier,
        },
        you: {
            xp: xpForSeason,
            currentTier: earnedTier,
            premium: user.battle_pass_premium && user.battle_pass_season === season.season_number,
        },
        rewards: rewards.map((r) => ({
            tier: r.tier,
            track: r.track,
            cosmeticId: r.cosmetic_id,
            unlocked: r.tier <= earnedTier,
            claimed: claimSet.has(`${r.tier}:${r.track}`),
        })),
    });
});

const claimSchema = z.object({
    tier: z.coerce.number().int().min(1),
    track: z.enum(['free', 'premium']),
});

battlePassRouter.post('/battlepass/claim', requireAuth, async (req, res) => {
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const season = await getCurrentSeason();
    if (!season) return res.status(400).json({ error: 'No active season' });

    const result = await claimTier({
        userId: req.session!.userId,
        seasonNumber: season.season_number,
        tier: parsed.data.tier,
        track: parsed.data.track,
    });
    if (!result.granted) return res.status(400).json({ error: result.error });
    res.json({ ok: true, cosmeticId: result.cosmeticId });
});

battlePassRouter.post('/battlepass/upgrade-premium', requireAuth, async (req, res) => {
    // TODO(prod): verify the IAP receipt server-side first.
    await unlockPremium(req.session!.userId);
    res.json({ ok: true });
});
