import { describe, it, expect } from 'vitest';
import {
    scoreGuess,
    validateGuess,
    bestGreenCount,
    decideOutcome,
    shouldEnd,
    MAX_GUESSES,
} from '../src/game/engine.js';

describe('scoreGuess', () => {
    it('returns all correct for an exact match', () => {
        const r = scoreGuess('CRANE', 'CRANE');
        expect(r.solved).toBe(true);
        expect(r.tiles).toEqual([
            'correct',
            'correct',
            'correct',
            'correct',
            'correct',
        ]);
    });

    it('returns all wrong when there is no overlap', () => {
        const r = scoreGuess('JUMPY', 'CRANE');
        expect(r.solved).toBe(false);
        expect(r.tiles).toEqual([
            'wrong',
            'wrong',
            'wrong',
            'wrong',
            'wrong',
        ]);
    });

    it('marks misplaced letters', () => {
        // Target: ACTOR. Guess: TRAIN.
        // T misplaced (in ACTOR), R misplaced, A misplaced, I wrong, N wrong.
        const r = scoreGuess('TRAIN', 'ACTOR');
        expect(r.tiles).toEqual([
            'misplaced',
            'misplaced',
            'misplaced',
            'wrong',
            'wrong',
        ]);
    });

    it('handles duplicate letters in guess where target has one — only one yellow', () => {
        // Target: ROBIN. Guess: ROBOT.
        // R correct, O correct, B correct, O — already consumed → wrong, T wrong.
        const r = scoreGuess('ROBOT', 'ROBIN');
        expect(r.tiles).toEqual([
            'correct',
            'correct',
            'correct',
            'wrong',
            'wrong',
        ]);
    });

    it('handles duplicate letters where one is correct and one is misplaced', () => {
        // Classic Wordle pain case. Target: ALLEY. Guess: LLAMA.
        // pass1: idx 1 'L' correct.
        // pass2: idx 0 'L' → finds another L (idx 2) → misplaced.
        //         idx 2 'A' → finds A (idx 0) → misplaced.
        //         idx 3 'M' → no M → wrong.
        //         idx 4 'A' → A already consumed → wrong.
        const r = scoreGuess('LLAMA', 'ALLEY');
        expect(r.tiles).toEqual([
            'misplaced',
            'correct',
            'misplaced',
            'wrong',
            'wrong',
        ]);
    });

    it('handles target with duplicates and guess without', () => {
        // Target: ALLEY. Guess: LATER.
        // L misplaced, A misplaced, T wrong, E correct, R wrong.
        const r = scoreGuess('LATER', 'ALLEY');
        expect(r.tiles).toEqual([
            'misplaced',
            'misplaced',
            'wrong',
            'correct',
            'wrong',
        ]);
    });

    it('is case-insensitive on input but uppercases the stored guess', () => {
        const r = scoreGuess('crane', 'crane');
        expect(r.guess).toBe('CRANE');
        expect(r.solved).toBe(true);
    });

    it('throws on length mismatch (caller bug)', () => {
        expect(() => scoreGuess('FOUR', 'FIVE5')).toThrow(/length mismatch/);
    });
});

describe('validateGuess', () => {
    const bank = new Set(['CRANE', 'TRAIN']);
    const has = (w: string) => bank.has(w);

    it('accepts a valid guess', () => {
        expect(validateGuess('CRANE', 5, has)).toBeNull();
    });

    it('rejects wrong length', () => {
        expect(validateGuess('CRANES', 5, has)?.code).toBe('WRONG_LENGTH');
    });

    it('rejects non-alphabetic input', () => {
        expect(validateGuess('CR4NE', 5, has)?.code).toBe('NON_ALPHABETIC');
    });

    it('rejects words not in the bank', () => {
        expect(validateGuess('SQUIB', 5, has)?.code).toBe('NOT_IN_WORD_BANK');
    });

    it('is case-insensitive', () => {
        expect(validateGuess('crane', 5, has)).toBeNull();
    });
});

describe('bestGreenCount', () => {
    it('returns 0 for an empty guess history', () => {
        expect(bestGreenCount([])).toBe(0);
    });

    it('returns the maximum greens across all guesses', () => {
        const guesses = [
            scoreGuess('CRANE', 'CRATE'), // 4 greens
            scoreGuess('TRAIN', 'CRATE'), // 1 green ('A' at idx 2)
        ];
        expect(bestGreenCount(guesses)).toBe(4);
    });
});

describe('decideOutcome', () => {
    it('declares p1 winner when p1 solved', () => {
        const p1 = [scoreGuess('CRANE', 'CRANE')];
        const p2 = [scoreGuess('TRAIN', 'CRANE')];
        expect(decideOutcome({ p1Guesses: p1, p2Guesses: p2 })).toBe(
            'p1_solved'
        );
    });

    it('uses best-green count when neither solved', () => {
        const p1 = [scoreGuess('CRANE', 'CRATE')]; // 4 greens
        const p2 = [scoreGuess('JUMPY', 'CRATE')]; // 0 greens
        expect(decideOutcome({ p1Guesses: p1, p2Guesses: p2 })).toBe(
            'p1_more_correct'
        );
    });

    it('declares a tie if both have equal greens and neither solved', () => {
        const p1 = [scoreGuess('CRANE', 'CRATE')]; // C,R,A,_,E = 4 greens
        const p2 = [scoreGuess('CRAVE', 'CRATE')]; // C,R,A,_,E = 4 greens
        // Just verify both have the same number of greens before asserting
        expect(bestGreenCount(p1)).toBe(4);
        expect(bestGreenCount(p2)).toBe(4);
        expect(decideOutcome({ p1Guesses: p1, p2Guesses: p2 })).toBe('tie');
    });

    it('forfeit by p1 awards the win to p2', () => {
        const p1 = [scoreGuess('CRANE', 'CRATE')];
        const p2 = [scoreGuess('JUMPY', 'CRATE')];
        expect(
            decideOutcome({ p1Guesses: p1, p2Guesses: p2, forfeitedPlayer: 1 })
        ).toBe('p2_solved');
    });

    it('breaks ties between two solvers by guess count', () => {
        const p1 = [
            scoreGuess('TRAIN', 'CRANE'),
            scoreGuess('CRANE', 'CRANE'),
        ];
        const p2 = [scoreGuess('CRANE', 'CRANE')]; // solved in 1
        expect(decideOutcome({ p1Guesses: p1, p2Guesses: p2 })).toBe(
            'p2_solved'
        );
    });
});

describe('shouldEnd', () => {
    it('ends when either player has solved', () => {
        const p1 = [scoreGuess('CRANE', 'CRANE')];
        const p2: ReturnType<typeof scoreGuess>[] = [];
        expect(shouldEnd(p1, p2)).toBe(true);
    });

    it('does not end while either player has guesses left and neither has solved', () => {
        const p1 = [scoreGuess('TRAIN', 'CRANE')];
        const p2 = [scoreGuess('JUMPY', 'CRANE')];
        expect(shouldEnd(p1, p2)).toBe(false);
    });

    it('ends when both players are out of guesses', () => {
        const p1 = Array.from({ length: MAX_GUESSES }, () =>
            scoreGuess('JUMPY', 'CRANE')
        );
        const p2 = Array.from({ length: MAX_GUESSES }, () =>
            scoreGuess('JUMPY', 'CRANE')
        );
        expect(shouldEnd(p1, p2)).toBe(true);
    });
});
