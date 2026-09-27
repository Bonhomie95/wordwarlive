// One fixed population of computer players shared by every leaderboard
// (Ranks: daily / weekly / monthly / all-time × classic / mystery / overall)
// and by the Daily Challenge board. Each player has a stable name, skill and
// play habit; their results for a given UTC day come from a seeded draw.
// Weekly / monthly / all-time are SUMS of those same days, so the boards are
// always consistent: nobody shows up in monthly without playing days inside
// it, and all-time ≥ monthly ≥ weekly ≥ daily for every player.
// Nothing is stored — everything is recomputed from seeds (memoized per day).
// Disclosed in TERMS §4.

import { generateBotUsername } from '../ai/bot.js';
import { tierFromPoints } from '../game/ranks.js';

/** mulberry32: tiny seeded PRNG, good enough for cosmetic randomness. */
export function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashStr(s: string): number {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
}

export const POPULATION_SIZE = 2500;
/** First day the computer players have history for (all-time sums start here). */
export const HISTORY_START = '2026-08-01';

export interface SyntheticPlayer {
    index: number;
    userId: string;
    username: string;
    basePoints: number;
    winRate: number;
    playDayProb: number;
    gamesMin: number;
    gamesMax: number;
    mysteryShare: number;
}

let pop: SyntheticPlayer[] | null = null;

export function population(): SyntheticPlayer[] {
    if (pop) return pop;
    const r = seeded(hashStr('wordwar-population-v1'));
    const seen = new Set<string>();
    const out: SyntheticPlayer[] = [];
    for (let i = 0; i < POPULATION_SIZE; i++) {
        let username = generateBotUsername(r);
        while (seen.has(username)) username = `${username.slice(0, 13)}${Math.floor(r() * 99)}`;
        seen.add(username);
        // Habits: 60% casual, 30% regular, 10% grinders. Grinders top the
        // daily board with ~6-9 wins — a keen real player can match that.
        const roll = r();
        const [playDayProb, gamesMin, gamesMax] =
            roll < 0.6 ? [0.35, 1, 3] : roll < 0.9 ? [0.6, 2, 5] : [0.8, 4, 9];
        out.push({
            index: i,
            userId: `synthetic:p:${i}`,
            username,
            basePoints: Math.round(800 + r() * r() * 1400), // mostly Stone–Silver, a few higher
            winRate: 0.38 + r() * 0.24,
            playDayProb,
            gamesMin,
            gamesMax,
            mysteryShare: 0.1 + r() * 0.2,
        });
    }
    pop = out;
    return out;
}

export interface DayTally { cw: number; cl: number; mw: number; ml: number }
const EMPTY: DayTally = { cw: 0, cl: 0, mw: 0, ml: 0 };

const SLOT_MS = 30 * 60_000;
const dayMemo = new Map<string, DayTally[]>();

/** Each player's tally for `date`. Past days are complete; today only counts
 *  games finished by the current 30-minute slot, so boards grow in steps. */
export function dayTallies(date: string, nowMs = Date.now()): DayTally[] {
    const dayStart = Date.parse(`${date}T00:00:00Z`);
    const elapsed = nowMs - dayStart;
    if (elapsed < 0) return population().map(() => EMPTY);
    const complete = elapsed >= 86_400_000;
    const slotFrac = complete ? 1 : (Math.floor(elapsed / SLOT_MS) + 1) / 48;
    const key = complete ? date : `${date}@${slotFrac}`;
    const hit = dayMemo.get(key);
    if (hit) return hit;

    const out = population().map((p) => {
        const r = seeded(hashStr(`${date}#p${p.index}`));
        if (r() > p.playDayProb) return EMPTY;
        const games = p.gamesMin + Math.floor(r() * (p.gamesMax - p.gamesMin + 1));
        const played = Math.floor(games * slotFrac);
        const t: DayTally = { cw: 0, cl: 0, mw: 0, ml: 0 };
        for (let g = 0; g < games; g++) {
            const win = r() < p.winRate;
            const mystery = r() < p.mysteryShare;
            if (g >= played) continue; // draw consumed so later slots stay identical
            if (mystery) win ? t.mw++ : t.ml++;
            else win ? t.cw++ : t.cl++;
        }
        return t;
    });
    if (dayMemo.size > 400) dayMemo.clear(); // ponytail: crude cap; ~1 year of days
    dayMemo.set(key, out);
    return out;
}

function addDays(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export type Period = 'daily' | 'weekly' | 'monthly' | 'all_time';
export type Mode = 'classic' | 'mystery' | 'overall';

function periodStart(period: Period, today: string): string {
    if (period === 'daily') return today;
    if (period === 'monthly') return `${today.slice(0, 7)}-01`;
    if (period === 'weekly') {
        const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
        return addDays(today, -dow);
    }
    return HISTORY_START;
}

export interface SyntheticEntry {
    userId: string;
    username: string;
    rankTier: string;
    wins: number;
    losses: number;
    rankPoints: number;
}

/** Everyone who has played in the period, with wins/losses for the mode. */
export function syntheticLeaderboard(period: Period, mode: Mode, nowMs = Date.now()): SyntheticEntry[] {
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const players = population();
    const sum = players.map(() => ({ w: 0, l: 0 }));
    const life = players.map(() => 0); // lifetime (wins - losses) for rank points
    const from = periodStart(period, today);
    for (let d = HISTORY_START; d <= today; d = addDays(d, 1)) {
        const tallies = dayTallies(d, nowMs);
        const inPeriod = d >= from;
        tallies.forEach((t, i) => {
            life[i]! += t.cw + t.mw - t.cl - t.ml;
            if (!inPeriod) return;
            const s = sum[i]!;
            if (mode !== 'mystery') { s.w += t.cw; s.l += t.cl; }
            if (mode !== 'classic') { s.w += t.mw; s.l += t.ml; }
        });
    }
    const out: SyntheticEntry[] = [];
    players.forEach((p, i) => {
        const s = sum[i]!;
        if (s.w + s.l === 0) return;
        const rankPoints = Math.max(0, p.basePoints + 6 * life[i]!);
        out.push({ userId: p.userId, username: p.username, rankTier: tierFromPoints(rankPoints), wins: s.w, losses: s.l, rankPoints });
    });
    return out.sort((a, b) => b.wins - a.wins || b.rankPoints - a.rankPoints);
}
