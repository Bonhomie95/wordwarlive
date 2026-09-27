// Computer-generated Daily Challenge solvers, so an early player isn't alone
// on the board. Deterministic per UTC date (same names + scores for everyone,
// no DB rows), arriving in 30-minute batches, and tuned to be beatable:
// no synthetic ever solves in 1 guess, a 2-guess solve is rare, and the bulk
// sits at 4-5 guesses — a good 3-guess solve lands in roughly the top 15%.
// Disclosed in TERMS §4.

import { hashStr as hashDate, population, seeded } from './syntheticPlayers.js';

export interface SyntheticSolver {
    userId: string;
    username: string;
    guessCount: number;
    durationMs: number;
    /** When this solver "finishes" — hidden before then. */
    solvedAtMs: number;
}

// Guess-count weights for 2..7 guesses.
const GUESS_WEIGHTS: [number, number][] = [
    [2, 1], [3, 16], [4, 37], [5, 29], [6, 14], [7, 3],
];

const SLOT_MS = 30 * 60_000;
const SLOTS_PER_DAY = 48;

/**
 * The whole day's computer solvers, in arrival order. At 00:00 UTC the first
 * batch of 200-400 lands; every 30 minutes after that another 10-30 join.
 * Everything is seeded from the date (and the slot), so every device sees the
 * identical board at the same moment.
 */
export function syntheticSolvers(date: string): SyntheticSolver[] {
    const dayStart = Date.parse(`${date}T00:00:00Z`);
    const total = GUESS_WEIGHTS.reduce((n, [, w]) => n + w, 0);
    const out: SyntheticSolver[] = [];
    const players = population();
    // Seeded shuffle of the population for today.
    const order = players.map((_, i) => i);
    const sh = seeded(hashDate(`${date}#order`));
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(sh() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
    }
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
        const r = seeded(hashDate(`${date}#${slot}`));
        const count = slot === 0 ? 200 + Math.floor(r() * 201) : 10 + Math.floor(r() * 21);
        for (let i = 0; i < count; i++) {
            let roll = r() * total;
            let guesses = 4;
            for (const [g, w] of GUESS_WEIGHTS) {
                if ((roll -= w) < 0) { guesses = g; break; }
            }
            // ~20-45 s per guess plus 15-60 s of thinking.
            const durationMs = Math.round((guesses * (20 + r() * 25) + 15 + r() * 45) * 1000);
            // Solvers are drawn from the shared population (no repeats in a
            // day), so a name on the Daily board is also on the Ranks boards.
            const p = players[order[out.length % order.length]!]!;
            out.push({
                userId: p.userId,
                username: p.username,
                guessCount: guesses,
                durationMs,
                solvedAtMs: dayStart + slot * SLOT_MS,
            });
        }
    }
    return out;
}

/** Solvers who have "finished" by `nowMs`. */
export function visibleSyntheticSolvers(date: string, nowMs = Date.now()): SyntheticSolver[] {
    return syntheticSolvers(date).filter((s) => s.solvedAtMs <= nowMs);
}
