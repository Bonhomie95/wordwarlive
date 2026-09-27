import { describe, it, expect } from 'vitest';
import { population, syntheticLeaderboard } from '../src/services/syntheticPlayers.js';
import { syntheticSolvers } from '../src/services/dailySynthetic.js';

const NOW = Date.parse('2026-09-27T15:10:00Z'); // a Sunday: week = Mon 21st..today

function byId(period: 'daily' | 'weekly' | 'monthly' | 'all_time', mode: 'classic' | 'mystery' | 'overall' = 'overall') {
    return new Map(syntheticLeaderboard(period, mode, NOW).map((e) => [e.userId, e]));
}

describe('synthetic players', () => {
    it('have stable, unique names', () => {
        const p = population();
        expect(new Set(p.map((x) => x.username)).size).toBe(p.length);
        expect(population()[42]!.username).toBe(p[42]!.username);
    });

    it('are consistent across periods: daily ⊆ weekly ⊆ monthly ⊆ all-time', () => {
        const d = byId('daily'), w = byId('weekly'), m = byId('monthly'), a = byId('all_time');
        expect(d.size).toBeGreaterThan(100);
        for (const [small, big] of [[d, w], [w, m], [m, a]] as const) {
            for (const [id, e] of small) {
                const b = big.get(id);
                expect(b).toBeDefined();
                expect(b!.wins).toBeGreaterThanOrEqual(e.wins);
                expect(b!.losses).toBeGreaterThanOrEqual(e.losses);
            }
        }
    });

    it('overall = classic + mystery in every period, and the daily top is beatable', () => {
        for (const period of ['daily', 'weekly', 'monthly', 'all_time'] as const) {
            const o = byId(period), c = byId(period, 'classic'), my = byId(period, 'mystery');
            for (const [id, e] of o) {
                expect(e.wins).toBe((c.get(id)?.wins ?? 0) + (my.get(id)?.wins ?? 0));
                expect(e.losses).toBe((c.get(id)?.losses ?? 0) + (my.get(id)?.losses ?? 0));
            }
        }
        const top = syntheticLeaderboard('daily', 'overall', NOW)[0]!;
        expect(top.wins).toBeLessThanOrEqual(12);
    });

    it('daily challenge solvers come from the same population', () => {
        const names = new Set(population().map((p) => p.username));
        for (const s of syntheticSolvers('2026-09-27')) expect(names.has(s.username)).toBe(true);
        const ids = syntheticSolvers('2026-09-27').map((s) => s.userId);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
