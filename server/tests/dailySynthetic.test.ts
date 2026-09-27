import { describe, it, expect } from 'vitest';
import { syntheticSolvers, visibleSyntheticSolvers } from '../src/services/dailySynthetic.js';

const DAY = '2026-09-27';
const start = Date.parse(`${DAY}T00:00:00Z`);

describe('synthetic daily solvers', () => {
    it('are identical on every call, unique, and beatable', () => {
        const a = syntheticSolvers(DAY);
        expect(syntheticSolvers(DAY)).toEqual(a);
        expect(new Set(a.map((s) => s.username)).size).toBe(a.length);
        expect(Math.min(...a.map((s) => s.guessCount))).toBeGreaterThanOrEqual(2); // a 1-guess solve always wins
        expect(a.filter((s) => s.guessCount === 2).length / a.length).toBeLessThan(0.03);
        expect(syntheticSolvers('2026-09-28')).not.toEqual(a);
    });

    it('start with 200-400 and add 10-30 every 30 minutes', () => {
        const first = visibleSyntheticSolvers(DAY, start).length;
        expect(first).toBeGreaterThanOrEqual(200);
        expect(first).toBeLessThanOrEqual(400);
        expect(visibleSyntheticSolvers(DAY, start + 29 * 60_000)).toHaveLength(first);
        let prev = first;
        for (let slot = 1; slot < 48; slot++) {
            const n = visibleSyntheticSolvers(DAY, start + slot * 30 * 60_000).length;
            expect(n - prev).toBeGreaterThanOrEqual(10);
            expect(n - prev).toBeLessThanOrEqual(30);
            prev = n;
        }
        expect(prev).toBe(syntheticSolvers(DAY).length);
    });
});
