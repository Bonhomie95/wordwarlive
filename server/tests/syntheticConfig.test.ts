import { describe, it, expect } from 'vitest';
import {
    defaults,
    settingsSchema,
    tuneDay,
    freezeCompletedActivity,
} from '../src/services/syntheticHistory.js';
describe('synthetic configuration', () => {
    it('rejects invalid intervals and caps', () => {
        expect(settingsSchema.safeParse({ ...defaults, dailyMin: 90, dailyMax: 30 }).success).toBe(
            false,
        );
        expect(settingsSchema.safeParse({ ...defaults, dailyCap: 10 }).success).toBe(false);
    });
    it('reduces new activity as real participation grows, reaching zero at target', () => {
        const full = tuneDay('2026-09-28', defaults, 0),
            half = tuneDay('2026-09-28', defaults, 250),
            none = tuneDay('2026-09-28', defaults, 500);
        expect(half.ranked.length).toBeLessThan(full.ranked.length);
        expect(half.daily.length).toBeLessThan(full.daily.length);
        expect(none).toEqual({ ranked: [], daily: [] });
    });
    it('caps per-player games and honors new daily arrival intervals', () => {
        const start = Date.parse('2026-09-28T00:00:00Z');
        const day = tuneDay(
            '2026-09-28',
            { ...defaults, dailyCap: 1, dailyMin: 45, dailyMax: 45 },
            0,
        );
        expect(new Set(day.ranked.map((e) => e.playerIndex)).size).toBe(day.ranked.length);
        const arrivals = [...new Set(day.daily.map((e) => e.solvedAtMs))];
        arrivals.forEach((at, i) => expect(at - (arrivals[i - 1] ?? start)).toBe(45 * 60000));
    });
    it('keeps high difficulty results achievable', () => {
        const day = tuneDay('2026-09-28', { ...defaults, difficulty: 'hard' }, 0);
        expect(day.daily.every((e) => e.guessCount >= 2 && e.durationMs >= 55000)).toBe(true);
    });
});

it('emergency pause keeps every visible result and cancels only future ones', () => {
    const day = tuneDay('2026-09-28', defaults, 0);
    const now = Date.parse('2026-09-28T12:00:32Z');
    const frozen = freezeCompletedActivity(day, now);
    expect(frozen.ranked).toEqual(
        day.ranked.filter((e) => e.atMs <= Math.floor(now / 60000) * 60000),
    );
    expect(frozen.daily).toEqual(day.daily.filter((e) => e.solvedAtMs <= now));
    expect(frozen.ranked.length).toBeLessThan(day.ranked.length);
});
