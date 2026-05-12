// Pure functions only. No I/O, no DB, no sockets. This module is the heart of
// the game and has the most stringent correctness requirements, so everything
// here is unit-tested in /tests/engine.test.ts.

export type Tile = 'correct' | 'misplaced' | 'wrong';

export interface GuessResult {
    /** The guess itself, normalized to uppercase. */
    guess: string;
    /** Per-letter result, in input order. */
    tiles: Tile[];
    /** True iff every tile is 'correct'. */
    solved: boolean;
}

export interface ValidationError {
    code:
        | 'WRONG_LENGTH'
        | 'NOT_IN_WORD_BANK'
        | 'NON_ALPHABETIC'
        | 'GAME_NOT_ACTIVE';
    message: string;
}

/** Maximum guesses per player per match. Matches the brief (6-row grid). */
export const MAX_GUESSES = 6;

/**
 * Score a guess against the target word using standard Wordle/Mastermind
 * rules: every letter is exactly one of correct / misplaced / wrong, and
 * duplicate letters in the guess are matched against duplicates in the
 * answer in a two-pass way — greens first, then yellows draw from the
 * remaining unmatched answer letters.
 *
 * Example: target "ALLEY", guess "LLAMA":
 *   pass 1 — second L is correct (matches ALLEY[1]); rest pending
 *   pass 2 — first L looks for an L in ALLEY's remaining letters → finds
 *            ALLEY[2], so misplaced. Then A finds ALLEY[0], misplaced.
 *            Then M and second A find nothing → wrong.
 *   tiles  = [misplaced, correct, misplaced, wrong, wrong]
 *
 * Both inputs are case-insensitive; output `guess` field is uppercase.
 */
export function scoreGuess(guess: string, target: string): GuessResult {
    const g = guess.toUpperCase();
    const t = target.toUpperCase();

    if (g.length !== t.length) {
        // The caller is supposed to validate length first via validateGuess.
        // If we get here it's a bug; throw rather than return junk.
        throw new Error(
            `scoreGuess: length mismatch (guess=${g.length}, target=${t.length})`
        );
    }

    const len = g.length;
    const tiles: Tile[] = new Array(len).fill('wrong');
    // Track which target letters have been consumed by a green or yellow,
    // so we don't double-count duplicates.
    const consumed = new Array(len).fill(false);

    // Pass 1: greens. A green at position i consumes target[i].
    for (let i = 0; i < len; i++) {
        if (g[i] === t[i]) {
            tiles[i] = 'correct';
            consumed[i] = true;
        }
    }

    // Pass 2: yellows. For each non-green guess letter, find any unconsumed
    // matching letter in the target.
    for (let i = 0; i < len; i++) {
        if (tiles[i] === 'correct') continue;
        for (let j = 0; j < len; j++) {
            if (consumed[j]) continue;
            if (g[i] === t[j]) {
                tiles[i] = 'misplaced';
                consumed[j] = true;
                break;
            }
        }
    }

    return {
        guess: g,
        tiles,
        solved: tiles.every((tile) => tile === 'correct'),
    };
}

/**
 * Validate that a candidate guess is acceptable to submit. Membership in
 * the word bank is delegated to the caller (we don't load the word bank
 * into pure code).
 */
export function validateGuess(
    guess: string,
    targetLength: number,
    wordBankHas: (word: string) => boolean
): ValidationError | null {
    const g = guess.toUpperCase();

    if (g.length !== targetLength) {
        return {
            code: 'WRONG_LENGTH',
            message: `Word must be ${targetLength} letters long.`,
        };
    }

    if (!/^[A-Z]+$/.test(g)) {
        return {
            code: 'NON_ALPHABETIC',
            message: 'Letters only, please.',
        };
    }

    if (!wordBankHas(g)) {
        return {
            code: 'NOT_IN_WORD_BANK',
            message: 'Not in word list.',
        };
    }

    return null;
}

/**
 * Count the number of correct (green) tiles in the player's *best* guess so
 * far. Used to decide the winner when neither player solved within the time
 * limit.
 */
export function bestGreenCount(guesses: GuessResult[]): number {
    let best = 0;
    for (const g of guesses) {
        const greens = g.tiles.filter((t) => t === 'correct').length;
        if (greens > best) best = greens;
    }
    return best;
}

/**
 * Final-state outcome decision. Called when the match clock hits zero or
 * either player solves.
 */
export type MatchOutcome =
    | 'p1_solved'
    | 'p2_solved'
    | 'p1_more_correct'
    | 'p2_more_correct'
    | 'tie'
    | 'forfeit';

export interface DecideArgs {
    p1Guesses: GuessResult[];
    p2Guesses: GuessResult[];
    /**
     * If a player forfeited (disconnected after timeout, etc.), pass their
     * id here. The other player wins by forfeit.
     */
    forfeitedPlayer?: 1 | 2;
}

export function decideOutcome(args: DecideArgs): MatchOutcome {
    if (args.forfeitedPlayer === 1) return 'p2_solved';
    if (args.forfeitedPlayer === 2) return 'p1_solved';

    const p1Solved = args.p1Guesses.some((g) => g.solved);
    const p2Solved = args.p2Guesses.some((g) => g.solved);

    // Both can't "solve at the same time" because the engine ends the match
    // the instant one solves. But guard against the data anyway.
    if (p1Solved && !p2Solved) return 'p1_solved';
    if (p2Solved && !p1Solved) return 'p2_solved';
    if (p1Solved && p2Solved) {
        // Whichever finished in fewer guesses; tiebreak goes to p1 by convention.
        return args.p1Guesses.length <= args.p2Guesses.length
            ? 'p1_solved'
            : 'p2_solved';
    }

    // Neither solved — compare best-green counts.
    const p1Best = bestGreenCount(args.p1Guesses);
    const p2Best = bestGreenCount(args.p2Guesses);
    if (p1Best > p2Best) return 'p1_more_correct';
    if (p2Best > p1Best) return 'p2_more_correct';
    return 'tie';
}

/**
 * Return whether the match should end RIGHT NOW based on the latest state.
 * The match ends if either player has solved or either has hit MAX_GUESSES.
 *
 * Time-based ending is handled by the match loop, not here.
 */
export function shouldEnd(
    p1Guesses: GuessResult[],
    p2Guesses: GuessResult[]
): boolean {
    if (p1Guesses.some((g) => g.solved)) return true;
    if (p2Guesses.some((g) => g.solved)) return true;
    if (p1Guesses.length >= MAX_GUESSES && p2Guesses.length >= MAX_GUESSES) {
        return true;
    }
    return false;
}
