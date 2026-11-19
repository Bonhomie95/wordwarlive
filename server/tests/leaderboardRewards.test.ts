import { describe, expect, it } from 'vitest';
import { boardLabel, currentEndsAt, lastClosed, noticeLine, prizeFor, prizeTable } from '../src/services/leaderboardRewardsService.js';

describe('leaderboard prizes', () => {
    it('pays tiers 1, 2, 3, 4–10, 11–20 … 91–100 and nothing after', () => {
        expect([1, 2, 3, 4, 10, 11, 20, 21, 95, 100, 101].map((r) => prizeFor('daily', r))).toEqual([100, 75, 50, 30, 30, 20, 20, 15, 3, 3, 0]);
        const table = prizeTable('weekly');
        expect(table[0]).toEqual({ from: 1, to: 1, coins: 400 });
        expect(table[3]).toEqual({ from: 4, to: 10, coins: 120 });
        expect(table.at(-1)).toEqual({ from: 91, to: 100, coins: 10 });
    });

    it('finds the last closed buckets and when the current ones close', () => {
        const now = new Date('2026-11-19T14:00:00Z'); // a Thursday
        expect(lastClosed('daily', now)).toEqual({ bucket: '2026-11-18', endsAt: new Date('2026-11-19T00:00:00Z') });
        expect(lastClosed('weekly', now)).toEqual({ bucket: '2026-W46', endsAt: new Date('2026-11-16T00:00:00Z') });
        expect(lastClosed('monthly', now)).toEqual({ bucket: '2026-10', endsAt: new Date('2026-11-01T00:00:00Z') });
        expect(currentEndsAt('weekly', now).toISOString()).toBe('2026-11-23T00:00:00.000Z');
        expect(currentEndsAt('monthly', now).toISOString()).toBe('2026-12-01T00:00:00.000Z');
        expect(boardLabel('weekly', new Date('2026-11-23T00:00:00Z'))).toBe('the weekly leaderboard (Nov 16–Nov 22)');
        expect(boardLabel('monthly', new Date('2026-12-01T00:00:00Z'))).toBe('the November 2026 leaderboard');
    });

    it('says what a result paid, or how far it was from the prizes', () => {
        const label = 'the daily leaderboard for Nov 18';
        expect(noticeLine({ rank: 5, coins: 60, label })).toBe('+60 coins for #5 on the daily leaderboard for Nov 18');
        expect(noticeLine({ rank: 134, coins: 0, label })).toBe('#134 on the daily leaderboard for Nov 18, 34 places from a prize');
        expect(noticeLine({ rank: 101, coins: 0, label })).toBe('#101 on the daily leaderboard for Nov 18, 1 place from a prize');
        expect(noticeLine({ rank: 1500, coins: 0, label })).toBe('#1,500 on the daily leaderboard for Nov 18');
    });
});
