import { describe, it, expect } from 'vitest';
import { syntheticSolvers, visibleSyntheticSolvers } from '../src/services/dailySynthetic.js';

describe('synthetic daily solvers', () => {
    it('are deterministic per day, 200-400 strong, unique names, beatable', () => {
        const a = syntheticSolvers('2026-09-27');
        expect(syntheticSolvers('2026-09-27')).toEqual(a);
        expect(a.length).toBeGreaterThanOrEqual(200);
        expect(a.length).toBeLessThanOrEqual(400);
        expect(new Set(a.map((s) => s.username)).size).toBe(a.length);
        expect(Math.min(...a.map((s) => s.guessCount))).toBeGreaterThanOrEqual(2); // a 1-guess solve always wins
        const threeOrBetter = a.filter((s) => s.guessCount <= 3).length / a.length;
        expect(threeOrBetter).toBeLessThan(0.3);
        expect(syntheticSolvers('2026-09-28')).not.toEqual(a);
    });

    it('reveal gradually through the day', () => {
        const start = Date.parse('2026-09-27T00:00:00Z');
        const early = visibleSyntheticSolvers('2026-09-27', start + 11 * 60_000).length;
        const noon = visibleSyntheticSolvers('2026-09-27', start + 12 * 3_600_000).length;
        const all = syntheticSolvers('2026-09-27').length;
        expect(early).toBeGreaterThanOrEqual(15);
        expect(noon).toBeGreaterThan(early);
        expect(visibleSyntheticSolvers('2026-09-27', start + 86_400_000)).toHaveLength(all);
    });
});
