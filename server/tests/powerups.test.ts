import { describe, it, expect } from 'vitest';
import {
    powerUpsForWin,
    EMPTY_INVENTORY,
} from '../src/game/powerups.js';

describe('powerUpsForWin', () => {
    it('awards a reveal at each milestone streak', () => {
        for (const streak of [3, 5, 10, 15, 20, 30, 50]) {
            expect(powerUpsForWin(streak)).toEqual({ reveal: 1 });
        }
    });

    it('awards nothing on non-milestone streaks', () => {
        for (const streak of [1, 2, 4, 6, 7, 11, 25, 100]) {
            expect(powerUpsForWin(streak)).toEqual({});
        }
    });
});

describe('EMPTY_INVENTORY', () => {
    it('starts every power-up at zero', () => {
        expect(EMPTY_INVENTORY).toEqual({ reveal: 0, scramble: 0, lock: 0 });
    });
});
