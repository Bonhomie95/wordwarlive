import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { findUserById, updateEquippedCosmetic } from '../services/userService.js';
import { getCosmetic } from '../services/cosmeticsService.js';

export const usersRouter = Router();

function shapeMe(u: NonNullable<Awaited<ReturnType<typeof findUserById>>>) {
    return {
        id: u.id,
        username: u.username,
        provider: u.auth_provider,
        rankPoints: u.rank_points,
        rankTier: u.rank_tier,
        wins: u.wins,
        losses: u.losses,
        winStreak: u.win_streak,
        bestStreak: u.best_streak,
        equipped: {
            boardTheme: u.equipped_board_theme,
            victoryAnim: u.equipped_victory_anim,
            avatar: u.equipped_avatar,
            nameplate: u.equipped_nameplate,
            profileBorder: u.equipped_profile_border,
        },
        battlePass: {
            xp: u.battle_pass_xp,
            premium: u.battle_pass_premium,
            season: u.battle_pass_season,
        },
        ads: {
            removed: u.ads_removed,
            lastDailyAdAt: u.last_daily_ad_at
                ? new Date(u.last_daily_ad_at).toISOString()
                : null,
            xpBoostAdsToday:
                u.xp_boost_ads_day === todayUtcDate()
                    ? u.xp_boost_ads_today
                    : 0,
            xpBoostDailyLimit: 5,
        },
        powerups: {
            reveal: u.powerup_reveal,
            scramble: u.powerup_scramble,
            lock: u.powerup_lock,
        },
        coins: u.coins,
        hintCredits: u.hint_credits,
        lifetimeHintsUsed: u.lifetime_hints_used,
        streak: {
            playStreak: u.play_streak,
            playStreakBest: u.play_streak_best,
            lastPlayDate: u.last_play_date,
        },
    };
}

function todayUtcDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function shapePublic(u: NonNullable<Awaited<ReturnType<typeof findUserById>>>) {
    return {
        id: u.id,
        username: u.username,
        rankPoints: u.rank_points,
        rankTier: u.rank_tier,
        wins: u.wins,
        losses: u.losses,
        bestStreak: u.best_streak,
        equipped: {
            boardTheme: u.equipped_board_theme,
            victoryAnim: u.equipped_victory_anim,
            avatar: u.equipped_avatar,
            nameplate: u.equipped_nameplate,
            profileBorder: u.equipped_profile_border,
        },
    };
}

usersRouter.get('/me', requireAuth, async (req, res) => {
    const user = await findUserById(req.session!.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(shapeMe(user));
});

usersRouter.get('/users/:id', async (req, res) => {
    const user = await findUserById(req.params.id!);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(shapePublic(user));
});

const equipSchema = z.object({
    category: z.enum([
        'board_theme',
        'victory_anim',
        'avatar',
        'nameplate',
        'profile_border',
    ]),
    cosmeticId: z.string().min(1),
});

usersRouter.patch('/me/equip', requireAuth, async (req, res) => {
    const parsed = equipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    // Verify the cosmetic exists and is in the right category.
    const cos = await getCosmetic(parsed.data.cosmeticId);
    if (!cos) return res.status(404).json({ error: 'Cosmetic not found' });
    if (cos.category !== parsed.data.category) {
        return res
            .status(400)
            .json({ error: 'Cosmetic does not match the requested category' });
    }
    try {
        await updateEquippedCosmetic(
            req.session!.userId,
            parsed.data.category,
            parsed.data.cosmeticId
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to equip';
        return res.status(400).json({ error: msg });
    }
    const user = await findUserById(req.session!.userId);
    res.json(shapeMe(user!));
});
