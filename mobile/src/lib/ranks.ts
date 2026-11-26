// Rank tier bands, mirrored from server/src/game/ranks.ts. Keep in sync.
import type { RankTier } from '../theme/colors';

export const TIER_BANDS: readonly { tier: RankTier; min: number }[] = [
    { tier: 'stone', min: 0 },
    { tier: 'bronze', min: 1100 },
    { tier: 'silver', min: 1300 },
    { tier: 'gold', min: 1500 },
    { tier: 'platinum', min: 1700 },
    { tier: 'diamond', min: 1900 },
    { tier: 'master', min: 2100 },
    { tier: 'legend', min: 2400 },
];

export function tierFromPoints(points: number): RankTier {
    let tier: RankTier = 'stone';
    for (const band of TIER_BANDS) if (points >= band.min) tier = band.tier;
    return tier;
}

/** Fraction (0..1) through the current tier band; 1 at the top tier. */
export function tierProgress(points: number): number {
    for (let i = 0; i < TIER_BANDS.length - 1; i++) {
        const lo = TIER_BANDS[i]!.min;
        const hi = TIER_BANDS[i + 1]!.min;
        if (points >= lo && points < hi) return (points - lo) / (hi - lo);
    }
    return points < 0 ? 0 : 1;
}

export function tierIndex(tier: RankTier): number {
    return TIER_BANDS.findIndex((b) => b.tier === tier);
}

/** RP for a win against an equally ranked player (Elo K=32; bots count half). */
export const RP_PER_EVEN_WIN = 16;

/** The next tier above `points`, the RP still needed, and progress through
 *  the current band. `nextTier` is null at the top tier. */
export function nextThreshold(points: number): { nextTier: RankTier | null; needed: number; progress: number } {
    const i = tierIndex(tierFromPoints(points));
    const next = TIER_BANDS[i + 1];
    if (!next) return { nextTier: null, needed: 0, progress: 1 };
    return { nextTier: next.tier, needed: next.min - points, progress: tierProgress(points) };
}

/** Rough wins to cover `rp` against even opponents ("about 7 wins"). */
export function winsFor(rp: number): number {
    return Math.max(1, Math.ceil(rp / RP_PER_EVEN_WIN));
}
