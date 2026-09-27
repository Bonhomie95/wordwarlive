// Computer-generated Daily Challenge solvers, so an early player isn't alone
// on the board. Deterministic per UTC date (same names + scores for everyone,
// no DB rows), revealed gradually through the day, and tuned to be beatable:
// no synthetic ever solves in 1 guess, a 2-guess solve is rare, and the bulk
// sits at 4-5 guesses — a good 3-guess solve lands in roughly the top 15%.
// Disclosed in TERMS §4.

import { generateBotUsername } from '../ai/bot.js';

export interface SyntheticSolver {
    userId: string;
    username: string;
    guessCount: number;
    durationMs: number;
    /** When this solver "finishes" — hidden before then. */
    solvedAtMs: number;
}

/** mulberry32: tiny seeded PRNG, good enough for cosmetic randomness. */
function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashDate(date: string): number {
    let h = 2166136261;
    for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
}

// Guess-count weights for 2..7 guesses.
const GUESS_WEIGHTS: [number, number][] = [
    [2, 3], [3, 17], [4, 36], [5, 28], [6, 13], [7, 3],
];
const ALWAYS_VISIBLE = 15; // "solved in the first minutes" so the board is never empty

export function syntheticSolvers(date: string): SyntheticSolver[] {
    const r = seeded(hashDate(date));
    const count = 200 + Math.floor(r() * 201); // 200-400
    const dayStart = Date.parse(`${date}T00:00:00Z`);
    const total = GUESS_WEIGHTS.reduce((n, [, w]) => n + w, 0);
    const out: SyntheticSolver[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
        let roll = r() * total;
        let guesses = 4;
        for (const [g, w] of GUESS_WEIGHTS) {
            if ((roll -= w) < 0) { guesses = g; break; }
        }
        // ~20-45 s per guess plus 15-60 s of thinking.
        const durationMs = Math.round((guesses * (20 + r() * 25) + 15 + r() * 45) * 1000);
        let username = generateBotUsername(r);
        while (seen.has(username)) username = `${username.slice(0, 13)}${Math.floor(r() * 99)}`;
        seen.add(username);
        const offset = i < ALWAYS_VISIBLE ? r() * 10 * 60_000 : r() * 86_400_000;
        out.push({ userId: `synthetic:${date}:${i}`, username, guessCount: guesses, durationMs, solvedAtMs: dayStart + offset });
    }
    return out;
}

/** Solvers who have "finished" by `nowMs`. */
export function visibleSyntheticSolvers(date: string, nowMs = Date.now()): SyntheticSolver[] {
    return syntheticSolvers(date).filter((s) => s.solvedAtMs <= nowMs);
}
