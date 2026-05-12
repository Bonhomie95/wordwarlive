// Rank logic. Eight tiers (Stone → Legend), with a mild Elo-style win/loss
// delta so high-ranked players grind for points while low-ranked ones can
// climb fast. Numbers are tunable.

export type RankTier =
    | 'stone'
    | 'bronze'
    | 'silver'
    | 'gold'
    | 'platinum'
    | 'diamond'
    | 'master'
    | 'legend';

interface TierBand {
    tier: RankTier;
    /** Inclusive lower bound for points to be in this tier. */
    min: number;
}

// Bands are ordered low → high so we can reverse-iterate to find the tier.
const TIER_BANDS: readonly TierBand[] = [
    { tier: 'stone', min: 0 },
    { tier: 'bronze', min: 1100 },
    { tier: 'silver', min: 1300 },
    { tier: 'gold', min: 1500 },
    { tier: 'platinum', min: 1700 },
    { tier: 'diamond', min: 1900 },
    { tier: 'master', min: 2100 },
    { tier: 'legend', min: 2400 },
] as const;

export const TIERS_IN_ORDER: readonly RankTier[] = TIER_BANDS.map((b) => b.tier);

export function tierFromPoints(points: number): RankTier {
    for (let i = TIER_BANDS.length - 1; i >= 0; i--) {
        const band = TIER_BANDS[i]!;
        if (points >= band.min) return band.tier;
    }
    return 'stone';
}

export function nextTierThreshold(
    points: number
): { nextTier: RankTier | null; pointsNeeded: number } {
    const current = tierFromPoints(points);
    const idx = TIER_BANDS.findIndex((b) => b.tier === current);
    const next = TIER_BANDS[idx + 1];
    if (!next) return { nextTier: null, pointsNeeded: 0 };
    return { nextTier: next.tier, pointsNeeded: next.min - points };
}

/**
 * Compute the rank delta for both players given the outcome. Closer-ranked
 * matches give roughly even gains. Beating a higher-rated opponent gives a
 * larger gain. Forfeits (or losing to a bot) are softened.
 */
export interface RankDeltaArgs {
    p1Points: number;
    p2Points: number;
    /** Either 'p1', 'p2', or 'tie'. */
    winner: 'p1' | 'p2' | 'tie';
    /** True if a forfeit caused the win. */
    forfeit?: boolean;
    /** True if either side is a bot — bot games still count, just less. */
    p1IsBot?: boolean;
    p2IsBot?: boolean;
}

export interface RankDelta {
    p1Delta: number;
    p2Delta: number;
}

const K_FACTOR = 32;
const TIE_DELTA = 5;
const BOT_SCALAR = 0.5; // Bot wins/losses are worth half.

function expectedScore(a: number, b: number): number {
    return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function computeRankDelta(args: RankDeltaArgs): RankDelta {
    const { p1Points, p2Points, winner, forfeit, p1IsBot, p2IsBot } = args;

    if (winner === 'tie') {
        // Both gain a small amount of points; ties are rare and should feel
        // mildly rewarding, not punishing.
        return { p1Delta: TIE_DELTA, p2Delta: TIE_DELTA };
    }

    const e1 = expectedScore(p1Points, p2Points);
    const e2 = 1 - e1;
    const s1 = winner === 'p1' ? 1 : 0;
    const s2 = winner === 'p2' ? 1 : 0;

    let p1Raw = K_FACTOR * (s1 - e1);
    let p2Raw = K_FACTOR * (s2 - e2);

    // Soften bot games — players shouldn't lose huge points to a bot.
    if (p1IsBot || p2IsBot) {
        p1Raw *= BOT_SCALAR;
        p2Raw *= BOT_SCALAR;
    }

    // Forfeits give the winner a smaller bump and the loser a smaller hit.
    if (forfeit) {
        p1Raw *= 0.6;
        p2Raw *= 0.6;
    }

    return {
        p1Delta: Math.round(p1Raw),
        p2Delta: Math.round(p2Raw),
    };
}

/** Don't let players drop below this. */
export const RANK_FLOOR = 0;

export function applyDelta(currentPoints: number, delta: number): number {
    return Math.max(RANK_FLOOR, currentPoints + delta);
}
