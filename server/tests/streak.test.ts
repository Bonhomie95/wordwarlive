import { describe, it, expect } from 'vitest';
import { nextStreak } from '../src/services/streakService.js';

describe('nextStreak (Streak Shield semantics)', () => {
    const today = '2026-09-24';
    it('first ever play starts at 1', () => {
        expect(nextStreak({ lastPlayDate: null, today, streak: 0, shields: 2 })).toEqual({ streak: 1, shieldsUsed: 0 });
    });
    it('played yesterday → +1, no shield used', () => {
        expect(nextStreak({ lastPlayDate: '2026-09-23', today, streak: 4, shields: 1 })).toEqual({ streak: 5, shieldsUsed: 0 });
    });
    it('missed one day with a shield → streak survives, one shield burned', () => {
        expect(nextStreak({ lastPlayDate: '2026-09-22', today, streak: 4, shields: 1 })).toEqual({ streak: 5, shieldsUsed: 1 });
    });
    it('missed two days with two shields → both burned', () => {
        expect(nextStreak({ lastPlayDate: '2026-09-21', today, streak: 9, shields: 2 })).toEqual({ streak: 10, shieldsUsed: 2 });
    });
    it('missed more days than shields → streak resets, shields kept', () => {
        expect(nextStreak({ lastPlayDate: '2026-09-20', today, streak: 9, shields: 2 })).toEqual({ streak: 1, shieldsUsed: 0 });
        expect(nextStreak({ lastPlayDate: '2026-09-22', today, streak: 4, shields: 0 })).toEqual({ streak: 1, shieldsUsed: 0 });
    });
});
