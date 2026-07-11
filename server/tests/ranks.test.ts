import { describe, it, expect } from 'vitest';
import {
    tierFromPoints,
    nextTierThreshold,
    computeRankDelta,
    applyDelta,
    RANK_FLOOR,
    TIERS_IN_ORDER,
} from '../src/game/ranks.js';

describe('tierFromPoints', () => {
    it('maps boundary values to the correct tier', () => {
        expect(tierFromPoints(0)).toBe('stone');
        expect(tierFromPoints(1099)).toBe('stone');
        expect(tierFromPoints(1100)).toBe('bronze');
        expect(tierFromPoints(1299)).toBe('bronze');
        expect(tierFromPoints(1300)).toBe('silver');
        expect(tierFromPoints(1500)).toBe('gold');
        expect(tierFromPoints(1700)).toBe('platinum');
        expect(tierFromPoints(1900)).toBe('diamond');
        expect(tierFromPoints(2100)).toBe('master');
        expect(tierFromPoints(2400)).toBe('legend');
        expect(tierFromPoints(999999)).toBe('legend');
    });

    it('never returns below stone, even for negative input', () => {
        expect(tierFromPoints(-100)).toBe('stone');
    });

    it('produces tiers in the declared order as points climb', () => {
        const seen = new Set<string>();
        for (let p = 0; p <= 2600; p += 50) seen.add(tierFromPoints(p));
        // Every tier should be reachable across the range.
        for (const tier of TIERS_IN_ORDER) expect(seen.has(tier)).toBe(true);
    });
});

describe('nextTierThreshold', () => {
    it('reports the gap to the next tier', () => {
        expect(nextTierThreshold(1000)).toEqual({
            nextTier: 'bronze',
            pointsNeeded: 100,
        });
        expect(nextTierThreshold(1290)).toEqual({
            nextTier: 'silver',
            pointsNeeded: 10,
        });
    });

    it('returns null tier at the top', () => {
        expect(nextTierThreshold(2400)).toEqual({
            nextTier: null,
            pointsNeeded: 0,
        });
        expect(nextTierThreshold(3000)).toEqual({
            nextTier: null,
            pointsNeeded: 0,
        });
    });
});

describe('computeRankDelta', () => {
    it('is a near-zero-sum exchange for evenly matched players', () => {
        const d = computeRankDelta({
            p1Points: 1500,
            p2Points: 1500,
            winner: 'p1',
        });
        // Equal ratings, K=32, expected 0.5 each → winner +16, loser -16.
        expect(d.p1Delta).toBe(16);
        expect(d.p2Delta).toBe(-16);
    });

    it('rewards beating a higher-rated opponent more', () => {
        const upset = computeRankDelta({
            p1Points: 1300,
            p2Points: 1700,
            winner: 'p1',
        });
        const expected = computeRankDelta({
            p1Points: 1700,
            p2Points: 1300,
            winner: 'p1',
        });
        expect(upset.p1Delta).toBeGreaterThan(expected.p1Delta);
    });

    it('gives both players a small positive bump on a tie', () => {
        const d = computeRankDelta({
            p1Points: 1500,
            p2Points: 1800,
            winner: 'tie',
        });
        expect(d.p1Delta).toBe(5);
        expect(d.p2Delta).toBe(5);
    });

    it('halves the swing for bot games', () => {
        const human = computeRankDelta({
            p1Points: 1500,
            p2Points: 1500,
            winner: 'p1',
        });
        const bot = computeRankDelta({
            p1Points: 1500,
            p2Points: 1500,
            winner: 'p1',
            p2IsBot: true,
        });
        expect(Math.abs(bot.p1Delta)).toBeLessThan(Math.abs(human.p1Delta));
        expect(bot.p1Delta).toBe(8); // 16 * 0.5
    });

    it('softens forfeits relative to a played-out win', () => {
        const played = computeRankDelta({
            p1Points: 1500,
            p2Points: 1500,
            winner: 'p1',
        });
        const forfeit = computeRankDelta({
            p1Points: 1500,
            p2Points: 1500,
            winner: 'p1',
            forfeit: true,
        });
        expect(Math.abs(forfeit.p1Delta)).toBeLessThan(Math.abs(played.p1Delta));
    });
});

describe('applyDelta', () => {
    it('adds the delta', () => {
        expect(applyDelta(1500, 16)).toBe(1516);
        expect(applyDelta(1500, -16)).toBe(1484);
    });

    it('never drops below the floor', () => {
        expect(applyDelta(10, -50)).toBe(RANK_FLOOR);
        expect(applyDelta(0, -1)).toBe(RANK_FLOOR);
    });
});
