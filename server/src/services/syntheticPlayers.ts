// One fixed population of computer players shared by every leaderboard
// (Ranks: daily / weekly / monthly / all-time × classic / mystery / overall)
// and by the Daily Challenge board. Each player has a stable name, skill and
// play habit; their results for a given UTC day come from a seeded draw.
// Weekly / monthly / all-time are SUMS of those same days, so the boards are
// always consistent: nobody shows up in monthly without playing days inside
// it. Weekly and monthly overlap but are not nested at month boundaries.
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

const DAY_MS = 86_400_000;
const SLOT_MS = 60_000;
const dayMemo = new Map<string, DayTally[]>();

const activityMemo = new Map<string, RankedActivity[]>();

export interface RankedActivity { waveStartedAtMs: number; atMs: number; playerIndex: number; win: boolean; mystery: boolean }

/** Seeded waves introduce 8–15 players who have not played today, alongside
 * varied groups of returning players. Actual matches finish individually. */
export function rankedActivity(date: string): RankedActivity[] {
    if (date < HISTORY_START) return [];
    const cached = activityMemo.get(date);
    if (cached) return cached;
    const start = Date.parse(`${date}T00:00:00Z`);
    const random = seeded(hashStr(`${date}#ranked-waves-v3`));
    const players = population();
    const counts = players.map(() => 0);
    const events: RankedActivity[] = [];
    // Weighted order favors regular players without excluding casual players.
    const order = players.map((p) => ({ index: p.index, weight: -Math.log(Math.max(1e-9, random())) / p.playDayProb }))
        .sort((a, b) => a.weight - b.weight).map((p) => p.index);
    let next = 0;
    let minute = 60 + Math.floor(random() * 181);
    while (minute < 24 * 60 - 18) {
        const newcomers = order.slice(next, next + 8 + Math.floor(random() * 8));
        next += newcomers.length;
        const returning = order.slice(0, next - newcomers.length)
            .filter((i) => counts[i]! < players[i]!.gamesMax)
            .map((index) => ({ index, weight: random() }))
            .sort((a, b) => a.weight - b.weight)
            .slice(0, [2, 4, 10, 20, 50][Math.floor(random() * 5)]!)
            .map((p) => p.index);
        for (const index of [...newcomers, ...returning]) {
            const p = players[index]!;
            const games = Math.min(p.gamesMax - counts[index]!, 1 + Math.floor(random() * 3));
            let finish = minute * 60000;
            for (let game = 0; game < games; game++) {
                finish += 60000 + Math.floor(random() * 300000);
                counts[index]!++;
                events.push({ waveStartedAtMs: start + minute * 60000, atMs: start + finish, playerIndex: index, win: random() < p.winRate, mystery: random() < p.mysteryShare });
            }
        }
        minute += 60 + Math.floor(random() * 181);
    }
    events.sort((a, b) => a.atMs - b.atMs || a.playerIndex - b.playerIndex);
    if (activityMemo.size >= 128) activityMemo.delete(activityMemo.keys().next().value!);
    activityMemo.set(date, events);
    return events;
}

/** All periods consume this same completed-match ledger. Reading the board
 * never advances a player; only elapsed UTC time reveals another result. */
export function dayTallies(date: string, nowMs = Date.now()): DayTally[] {
    const dayStart = Date.parse(`${date}T00:00:00Z`);
    const elapsed = nowMs - dayStart;
    if (date < HISTORY_START || elapsed < 0) return population().map(() => EMPTY);
    const complete = elapsed >= DAY_MS;
    const cutoff = complete ? DAY_MS : Math.floor(elapsed / SLOT_MS) * SLOT_MS;
    const key = complete ? date : `${date}@${cutoff}`;
    const hit = dayMemo.get(key);
    if (hit) return hit;
    const out = population().map(() => ({ cw: 0, cl: 0, mw: 0, ml: 0 }));
    for (const event of rankedActivity(date)) {
        if (event.atMs > dayStart + cutoff) break;
        const tally = out[event.playerIndex]!;
        if (event.mystery) event.win ? tally.mw++ : tally.ml++;
        else event.win ? tally.cw++ : tally.cl++;
    }
    if (dayMemo.size >= 512) dayMemo.delete(dayMemo.keys().next().value!);
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

/** Stable total ordering shared by synthetic and persisted standings. */
export function compareStandings(a: Pick<SyntheticEntry, 'wins' | 'rankPoints' | 'userId'>, b: Pick<SyntheticEntry, 'wins' | 'rankPoints' | 'userId'>): number {
    return b.wins - a.wins || b.rankPoints - a.rankPoints || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
}

const boardMemo = new Map<string, SyntheticEntry[]>();

/** Everyone who has played in the period, with wins/losses for the mode. */
export function syntheticLeaderboard(period: Period, mode: Mode, nowMs = Date.now()): SyntheticEntry[] {
    const cacheKey = `${period}:${mode}:${Math.floor(nowMs / SLOT_MS)}`;
    const cached = boardMemo.get(cacheKey);
    if (cached) return cached;
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
    out.sort(compareStandings);
    if (boardMemo.size >= 36) boardMemo.delete(boardMemo.keys().next().value!);
    boardMemo.set(cacheKey, out);
    return out;
}
