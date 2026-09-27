import { describe, it, expect } from 'vitest';
import { population, syntheticLeaderboard, dayTallies, rankedActivity } from '../src/services/syntheticPlayers.js';
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
        expect(d.size).toBeGreaterThan(20);
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


describe('activity sessions and boundary accounting', () => {
    it('never decreases completed results during a day and respects individual daily caps', () => {
        const date = '2026-09-27';
        const start = Date.parse(`${date}T00:00:00Z`);
        let previous = dayTallies(date, start);
        expect(previous.every((t) => t.cw + t.cl + t.mw + t.ml === 0)).toBe(true);
        for (let hour = 1; hour <= 24; hour++) {
            const next = dayTallies(date, start + hour * 3600000);
            next.forEach((t, i) => {
                for (const field of ['cw', 'cl', 'mw', 'ml'] as const) expect(t[field]).toBeGreaterThanOrEqual(previous[i]![field]);
                expect(t.cw + t.cl + t.mw + t.ml).toBeLessThanOrEqual(population()[i]!.gamesMax);
            });
            previous = next;
        }
    });
    it('weekly and monthly match their own UTC dates when a week crosses a month', () => {
        const now = Date.parse('2026-10-01T13:25:00Z'); // Thursday; Monday was in September.
        const week = new Map(syntheticLeaderboard('weekly', 'overall', now).map((e) => [e.userId, e]));
        const month = new Map(syntheticLeaderboard('monthly', 'overall', now).map((e) => [e.userId, e]));
        for (const player of population().slice(0, 40)) {
            let wins = 0, losses = 0;
            for (const day of ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']) {
                const t = dayTallies(day, now)[player.index]!;
                wins += t.cw + t.mw; losses += t.cl + t.ml;
            }
            expect(week.get(player.userId)?.wins ?? 0).toBe(wins);
            expect(week.get(player.userId)?.losses ?? 0).toBe(losses);
            const today = dayTallies('2026-10-01', now)[player.index]!;
            expect(month.get(player.userId)?.wins ?? 0).toBe(today.cw + today.mw);
        }
    });
    it('has no results before the shared history starts', () => {
        expect(syntheticLeaderboard('all_time', 'overall', Date.parse('2026-07-31T23:59:59Z'))).toEqual([]);
        expect(syntheticSolvers('2026-07-31')).toEqual([]);
    });
});


describe('ranked activity waves', () => {
    it('introduces small groups every 60–240 minutes and advances existing players separately', () => {
        const date = '2026-09-27';
        const start = Date.parse(`${date}T00:00:00Z`);
        const events = rankedActivity(date);
        expect(rankedActivity(date)).toEqual(events);
        const waves = [...new Set(events.map((e) => e.waveStartedAtMs))].sort((a, b) => a - b);
        const seen = new Set<number>();
        const sizes = new Set<number>();
        let previous = start;
        let returningTotal = 0;
        for (const wave of waves) {
            expect((wave - previous) / 60000).toBeGreaterThanOrEqual(60);
            expect((wave - previous) / 60000).toBeLessThanOrEqual(240);
            const participants = new Set(events.filter((e) => e.waveStartedAtMs === wave).map((e) => e.playerIndex));
            const newcomers = [...participants].filter((id) => !seen.has(id));
            expect(newcomers.length).toBeGreaterThanOrEqual(8);
            expect(newcomers.length).toBeLessThanOrEqual(15);
            returningTotal += participants.size - newcomers.length;
            sizes.add(participants.size);
            participants.forEach((id) => seen.add(id));
            previous = wave;
        }
        expect(returningTotal).toBeGreaterThan(0);
        expect(sizes.size).toBeGreaterThan(2);
        for (const player of population()) {
            const matches = events.filter((e) => e.playerIndex === player.index);
            for (let i = 1; i < matches.length; i++) expect(matches[i]!.atMs - matches[i - 1]!.atMs).toBeGreaterThanOrEqual(60000);
        }
        expect(events.every((e) => e.atMs < start + 86400000)).toBe(true);
    });
});


it('advances existing players consistently across all boards during the day', () => {
    const start = Date.parse('2026-09-27T00:00:00Z');
    const end = start + 86399999;
    const before = new Map(syntheticLeaderboard('all_time', 'overall', start).map((e) => [e.userId, e]));
    const after = syntheticLeaderboard('all_time', 'overall', end);
    const today = dayTallies('2026-09-27', end);
    let improved = 0;
    for (const entry of after) {
        const old = before.get(entry.userId);
        if (!old) continue;
        const player = population().find((p) => p.userId === entry.userId)!;
        const t = today[player.index]!;
        expect(entry.wins - old.wins).toBe(t.cw + t.mw);
        expect(entry.losses - old.losses).toBe(t.cl + t.ml);
        if (entry.rankPoints > old.rankPoints) improved++;
    }
    expect(improved).toBeGreaterThan(0);
    for (const period of ['daily', 'weekly', 'monthly'] as const) {
        for (const entry of syntheticLeaderboard(period, 'overall', end)) {
            const lifetime = after.find((e) => e.userId === entry.userId)!;
            expect(lifetime).toBeDefined();
            expect(entry.rankPoints).toBe(lifetime.rankPoints);
        }
    }
});
