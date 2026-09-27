// Computer-generated Daily Challenge solvers, so an early player isn't alone
// on the board. Deterministic per UTC date (same names + scores for everyone,
// no DB rows), arriving in randomly spaced 30–60 minute waves, and tuned to be beatable:
// no synthetic ever solves in 1 guess, a 2-guess solve is rare, and the bulk
// sits at 4-5 guesses — a good 3-guess solve lands in roughly the top 15%.
// Disclosed in TERMS §4.

import { hashStr as hashDate, population, seeded, HISTORY_START } from './syntheticPlayers.js';

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

const MINUTE_MS = 60_000;

/** Same schedule for every viewer. Small groups finish every 30–60 minutes;
 * nobody appears before enough time has elapsed to solve the challenge. */
export function syntheticSolvers(date: string): SyntheticSolver[] {
    if (date < HISTORY_START) return [];
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
    const schedule = seeded(hashDate(`${date}#daily-waves-v3`));
    let minute = 30 + Math.floor(schedule() * 31);
    for (let slot = 0; minute < 1440; slot++) {
        const r = seeded(hashDate(`${date}#${slot}`));
        const count = 8 + Math.floor(r() * 23);
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
                solvedAtMs: dayStart + minute * MINUTE_MS,
            });
        }
        minute += 30 + Math.floor(schedule() * 31);
    }
    return out.sort((a, b) => a.solvedAtMs - b.solvedAtMs || a.userId.localeCompare(b.userId));
}

/** Solvers who have "finished" by `nowMs`. */
export function visibleSyntheticSolvers(date: string, nowMs = Date.now()): SyntheticSolver[] {
    return syntheticSolvers(date).filter((s) => s.solvedAtMs <= nowMs);
}
