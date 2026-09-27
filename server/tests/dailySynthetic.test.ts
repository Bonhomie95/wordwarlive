import { describe, it, expect } from 'vitest';
import { syntheticSolvers, visibleSyntheticSolvers } from '../src/services/dailySynthetic.js';
const DAY = '2026-09-27';
const start = Date.parse(`${DAY}T00:00:00Z`);

describe('synthetic daily solvers', () => {
    it('are stable, unique, achievable and varied by day', () => {
        const a = syntheticSolvers(DAY);
        expect(syntheticSolvers(DAY)).toEqual(a);
        expect(new Set(a.map((s) => s.userId)).size).toBe(a.length);
        expect(new Set(a.map((s) => s.username)).size).toBe(a.length);
        expect(a.every((s) => s.guessCount >= 2 && s.guessCount <= 7)).toBe(true);
        expect(a.filter((s) => s.guessCount === 2).length / a.length).toBeLessThan(0.03);
        expect(syntheticSolvers('2026-09-28')).not.toEqual(a);
        for (const result of a) {
            expect(result.durationMs).toBeGreaterThanOrEqual(55000);
            expect(result.solvedAtMs - start).toBeGreaterThanOrEqual(result.durationMs);
            expect(result.solvedAtMs).toBeLessThan(start + 86400000);
        }
    });
    it('adds varied groups every 30–60 minutes with no midnight results', () => {
        expect(visibleSyntheticSolvers(DAY, start)).toEqual([]);
        expect(visibleSyntheticSolvers(DAY, start - 1)).toEqual([]);
        const groups = new Map<number, number>();
        for (const result of syntheticSolvers(DAY)) groups.set(result.solvedAtMs, (groups.get(result.solvedAtMs) ?? 0) + 1);
        let previous = start;
        for (const [at, count] of groups) {
            expect((at - previous) / 60000).toBeGreaterThanOrEqual(30);
            expect((at - previous) / 60000).toBeLessThanOrEqual(60);
            expect(count).toBeGreaterThanOrEqual(8);
            expect(count).toBeLessThanOrEqual(30);
            expect(visibleSyntheticSolvers(DAY, at).length - visibleSyntheticSolvers(DAY, at - 1).length).toBe(count);
            previous = at;
        }
        expect(new Set(groups.values()).size).toBeGreaterThan(5);
    });
});
