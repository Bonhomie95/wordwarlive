// Power-ups are EARNED, never bought. The brief is explicit on this — buying
// power-ups destroys competitive integrity. Sources:
//   - Win streaks award `Reveal` charges
//   - Daily login awards `Lock` charges
//   - Weekly streak rewards `Scramble`

export type PowerUp = 'reveal' | 'scramble' | 'lock';

export interface PowerUpInventory {
    reveal: number;
    scramble: number;
    lock: number;
}

export const EMPTY_INVENTORY: PowerUpInventory = {
    reveal: 0,
    scramble: 0,
    lock: 0,
};

/**
 * Awards earned at the end of a match. Currently just win-streak driven.
 * Returns the inventory delta to apply.
 */
export function powerUpsForWin(currentStreakAfterWin: number): Partial<PowerUpInventory> {
    // Every win streak of 3, 5, 10, … awards a reveal.
    if ([3, 5, 10, 15, 20, 30, 50].includes(currentStreakAfterWin)) {
        return { reveal: 1 };
    }
    return {};
}
