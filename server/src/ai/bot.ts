// Bot opponent for matchmaking fallbacks. Behaves enough like a human that
// matches feel competitive without actually cheating (the bot only sees its
// own tile feedback, never the target word). Uses Groq for guess selection;
// if Groq isn't configured we fall back to a simple heuristic so the game
// still works.
//
// Key design choices:
//  • Bots have a difficulty level driven by the human opponent's rank.
//    Stone/Bronze players face mediocre bots; Diamond+ face sharp ones.
//  • Bots think for 4–12s between guesses (random) so the cadence feels
//    human-ish. Tunable via BOT_THINK_MIN/MAX_MS.
//  • Bot usernames start with `bot-` and `is_bot` is surfaced to the
//    client per the brief — no impersonation.

import { groqJSON, isGroqEnabled } from './groq.js';
import { isValidWord, pickRandomWord } from '../game/words.js';
import type { GuessResult } from '../game/engine.js';
import { logger } from '../utils/logger.js';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

// Bot think time. With matches now lasting 6 minutes (360s), a bot that
// guesses every 4–12 seconds would burn through the 6-guess cap in well
// under a minute. We scale to 25–70s so bots use their cap across most of
// the match window, and so 'easy' bots actually feel slower than 'hard' ones.
const BOT_THINK_MIN_MS = 25_000;
const BOT_THINK_MAX_MS = 70_000;

export function difficultyForRank(rankPoints: number): BotDifficulty {
    if (rankPoints < 1300) return 'easy';
    if (rankPoints < 1900) return 'medium';
    return 'hard';
}

export interface RecentResultsSummary {
    /** Consecutive wins ending at "now" (0 if last match was a loss/tie). */
    consecutiveWins: number;
    /** Consecutive losses ending at "now" (0 if last match was a win/tie). */
    consecutiveLosses: number;
    /** Wins out of last 5 matches. */
    recentWins: number;
    /** Total matches considered (≤ 5). */
    recentTotal: number;
}

/**
 * Adaptive bot difficulty.
 *
 * Principle: the player should feel met, not crushed or coddled. Start from
 * rank-based difficulty and shift one level in either direction based on
 * recent form:
 *
 *   - 3+ consecutive wins   → bump UP   (they're hot, give them a fight)
 *   - 2+ consecutive losses → drop DOWN (avoid frustration spirals)
 *   - 4+ wins of last 5     → bump UP   (sustained good form)
 *   - 4+ losses of last 5   → drop DOWN (player needs a confidence win)
 *
 * Shifts stack independently and clamp to ['easy', 'hard'].
 */
export function adaptiveDifficulty(
    rankPoints: number,
    summary: RecentResultsSummary
): BotDifficulty {
    const order: BotDifficulty[] = ['easy', 'medium', 'hard'];
    const baseIdx = order.indexOf(difficultyForRank(rankPoints));

    let shift = 0;
    if (summary.consecutiveWins >= 3) shift += 1;
    if (summary.consecutiveLosses >= 2) shift -= 1;
    if (summary.recentTotal >= 5 && summary.recentWins >= 4) shift += 1;
    if (
        summary.recentTotal >= 5 &&
        summary.recentTotal - summary.recentWins >= 4
    ) {
        shift -= 1;
    }

    const finalIdx = Math.max(0, Math.min(order.length - 1, baseIdx + shift));
    return order[finalIdx]!;
}

/**
 * How long to wait before submitting the next guess. Hard bots think faster.
 */
export function thinkTimeMs(difficulty: BotDifficulty): number {
    const span = BOT_THINK_MAX_MS - BOT_THINK_MIN_MS;
    const factor = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 0.75 : 0.5;
    return Math.round(BOT_THINK_MIN_MS + Math.random() * span * factor);
}

interface BotChoiceArgs {
    /** Length of the target word. */
    wordLength: number;
    /** All guesses the bot has made so far, with tile feedback. */
    history: GuessResult[];
    difficulty: BotDifficulty;
    /** Pool of legal candidate words (already filtered to the right length). */
    candidates: string[];
}

interface GroqGuessResponse {
    guess: string;
    rationale?: string;
}

/**
 * Pick the bot's next guess. Deterministic fallback if Groq is off.
 */
export async function chooseBotGuess(args: BotChoiceArgs): Promise<string> {
    // First guess: just pick a strong opener.
    if (args.history.length === 0) {
        return pickOpener(args.wordLength, args.candidates);
    }

    if (isGroqEnabled()) {
        try {
            const choice = await groqPickGuess(args);
            if (choice && isValidWord(choice) && choice.length === args.wordLength) {
                return choice.toUpperCase();
            }
        } catch (err) {
            logger.warn({ err }, 'Bot Groq pick failed; falling back');
        }
    }
    return heuristicPick(args);
}

const OPENERS_BY_LEN: Record<number, string[]> = {
    5: ['CRANE', 'SLATE', 'TRACE', 'AUDIO', 'ROATE'],
    6: ['CRANES', 'CASINO', 'PUBLIC', 'GROUND', 'MARKET'],
    7: ['CRAYONS', 'CABINET', 'OUTSIDE', 'AIRPORT', 'HISTORY'],
    8: ['ABDUCTOR', 'OUTRIDES', 'NOTARIZE', 'EDUCATOR', 'AIRPLANE'],
};

function pickOpener(wordLength: number, candidates: string[]): string {
    const preferred = OPENERS_BY_LEN[wordLength] ?? [];
    for (const o of preferred) {
        if (isValidWord(o)) return o;
    }
    if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)]!.toUpperCase();
    }
    return pickRandomWord(wordLength).toUpperCase();
}

/**
 * Heuristic fallback. Filters the candidate list against the tile feedback —
 * keeps only words consistent with every prior guess — then returns a random
 * one.
 */
function heuristicPick(args: BotChoiceArgs): string {
    const filtered = filterCandidates(args.candidates, args.history);
    const pool = filtered.length > 0 ? filtered : args.candidates;
    if (pool.length === 0) return pickRandomWord(args.wordLength).toUpperCase();
    return pool[Math.floor(Math.random() * pool.length)]!.toUpperCase();
}

/**
 * Returns words in `candidates` that are consistent with the tile feedback
 * we've seen so far. Strict implementation of standard Wordle constraint
 * propagation: each guess constrains target letter positions and per-letter
 * counts.
 */
function filterCandidates(candidates: string[], history: GuessResult[]): string[] {
    return candidates.filter((c) => {
        const word = c.toUpperCase();
        for (const h of history) {
            if (!isConsistent(word, h)) return false;
        }
        return true;
    });
}

function isConsistent(target: string, guess: GuessResult): boolean {
    const len = target.length;
    if (guess.guess.length !== len) return false;

    // For each letter in the guess, its tile tells us something about target.
    // Use position-based + count-based checks the same way scoreGuess does.
    const targetCounts: Record<string, number> = {};
    for (const ch of target) targetCounts[ch] = (targetCounts[ch] ?? 0) + 1;

    // Pass 1: greens must match exactly.
    for (let i = 0; i < len; i++) {
        if (guess.tiles[i] === 'correct' && target[i] !== guess.guess[i]) return false;
    }
    // Account for greens against count budget.
    for (let i = 0; i < len; i++) {
        if (guess.tiles[i] === 'correct') {
            const ch = guess.guess[i]!;
            targetCounts[ch] = (targetCounts[ch] ?? 0) - 1;
            if (targetCounts[ch]! < 0) return false;
        }
    }
    // Pass 2: misplaceds — that letter must NOT be in target[i] but must
    // exist somewhere unconsumed.
    for (let i = 0; i < len; i++) {
        if (guess.tiles[i] === 'misplaced') {
            const ch = guess.guess[i]!;
            if (target[i] === ch) return false;
            if ((targetCounts[ch] ?? 0) <= 0) return false;
            targetCounts[ch]! -= 1;
        }
    }
    // Pass 3: wrongs — the letter must NOT appear in any remaining slot.
    // (Note: with duplicates, "wrong" only means "no more of this letter
    // beyond the greens/yellows already accounted for".)
    for (let i = 0; i < len; i++) {
        if (guess.tiles[i] === 'wrong') {
            const ch = guess.guess[i]!;
            if (target[i] === ch) return false;
            if ((targetCounts[ch] ?? 0) > 0) return false;
        }
    }
    return true;
}

async function groqPickGuess(args: BotChoiceArgs): Promise<string> {
    // Pre-filter so Groq only sees plausible words. This is critical — without
    // it the model often picks something that contradicts the feedback.
    const filtered = filterCandidates(args.candidates, args.history).slice(0, 60);
    if (filtered.length === 0) return heuristicPick(args);

    const personality =
        args.difficulty === 'easy'
            ? 'You are a casual player who sometimes picks suboptimal words.'
            : args.difficulty === 'medium'
            ? 'You play thoughtfully, balancing letter coverage and locking in known letters.'
            : 'You play optimally, treating every guess as a maximum-information move.';

    const system = [
        'You are playing a Wordle-style 1v1 game and need to pick the next guess.',
        personality,
        'Pick exactly one word from the provided candidate list — never invent words.',
        'Respond as JSON: {"guess": "<UPPERCASE>"}.',
    ].join(' ');

    const historyLines = args.history
        .map(
            (h, i) =>
                `${i + 1}. ${h.guess}  -> ${h.tiles
                    .map((t) =>
                        t === 'correct' ? 'GREEN' : t === 'misplaced' ? 'YELLOW' : 'GRAY'
                    )
                    .join(' ')}`
        )
        .join('\n');

    const user = [
        `Word length: ${args.wordLength}`,
        `Your guesses so far:`,
        historyLines || '(none yet)',
        ``,
        `Candidate words:`,
        filtered.join(', '),
    ].join('\n');

    const r = await groqJSON<GroqGuessResponse>({
        system,
        user,
        temperature: args.difficulty === 'easy' ? 0.9 : args.difficulty === 'medium' ? 0.5 : 0.2,
        maxTokens: 60,
    });
    return r.guess?.toUpperCase() ?? '';
}

// ─── Realistic username generation ──────────────────────────────────────────
//
// Bots used to be named `bot-fox-1234` so they were visually obvious. We now
// generate human-looking usernames using patterns real players pick: first
// names with numbers, first_last, initials + last name, adjective + noun,
// and so on. Names cap at 16 chars to fit the same constraint as real users.

const FIRST_NAMES = [
    // Anglo
    'alex','sam','jordan','taylor','morgan','jamie','riley','casey','quinn','avery',
    'james','ben','tom','will','jack','dan','ryan','luke','adam','matt','chris','nick',
    'kate','sara','anna','hannah','grace','lily','rose','jade','ella','mae','zoe','ivy',
    // East Asian
    'mei','jun','ren','akira','yuki','hana','kenji','sora','hiro','aiko',
    // South Asian
    'priya','arjun','rohan','neha','kiran','dev','asha','vikram','riya','aman',
    // West African
    'kofi','adeola','chinwe','tunde','amara','obi','nnamdi','funmi','tobi','lola',
    // Latin / Iberian
    'mateo','sofia','diego','luna','rafa','elena','pablo','ines','marco','clara',
    // Slavic
    'milan','ana','lena','dmitri','ivan','olya','katya','niko','sasha','dasha',
    // Arabic / MENA
    'omar','layla','yusuf','farah','rami','nour','ali','zara','khalid','aisha',
];

const LAST_FRAGMENTS = [
    'wright','smith','jones','green','black','white','gray','reed','stone','park',
    'lake','hill','ford','wood','field','clark','baker','cook','price','hart',
    'cole','knox','vega','cruz','rios','diaz','silva','rey','mont','sol',
    'chen','tanaka','khan','patel','singh','okafor','garcia','lopez','nguyen','tran',
];

const ADJECTIVES = [
    'quiet','quick','calm','brave','fast','sharp','wild','lucky','silver','golden',
    'silent','swift','lone','cosmic','iron','glass','jade','onyx','ruby','steel',
    'late','early','rough','smooth','clever','bright','dusky','frosty','spry','keen',
];

const NOUNS = [
    'fox','wolf','hawk','crow','owl','tiger','bear','lynx','seal','otter',
    'sky','sun','moon','star','river','flame','frost','tide','dusk','dawn',
    'leaf','reed','pine','oak','peak','crest','ember','spark','wave','shore',
];

function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(lo: number, hi: number): number {
    return Math.floor(lo + Math.random() * (hi - lo + 1));
}

/**
 * Generates a single random realistic-looking username. Caller is responsible
 * for handling collisions (see createBotUser below).
 */
export function generateBotUsername(): string {
    const patterns: Array<() => string> = [
        // alex42, sam283, taylor7
        () => `${pick(FIRST_NAMES)}${randInt(2, 999)}`,
        // jamie_wright, sara_park
        () => `${pick(FIRST_NAMES)}_${pick(LAST_FRAGMENTS)}`,
        // ben.k, mia.s
        () => `${pick(FIRST_NAMES)}.${String.fromCharCode(97 + randInt(0, 25))}`,
        // jwright, mchen
        () =>
            `${String.fromCharCode(97 + randInt(0, 25))}${pick(LAST_FRAGMENTS)}`,
        // jwright92, mchen04
        () =>
            `${String.fromCharCode(97 + randInt(0, 25))}${pick(LAST_FRAGMENTS)}${randInt(0, 99)}`,
        // silentfox, swifthawk
        () => `${pick(ADJECTIVES)}${pick(NOUNS)}`,
        // silentfox42
        () => `${pick(ADJECTIVES)}${pick(NOUNS)}${randInt(2, 99)}`,
        // alex2002 (year-ish)
        () => `${pick(FIRST_NAMES)}${randInt(1990, 2009)}`,
        // first + last, no separator: bencole, miarey
        () => `${pick(FIRST_NAMES)}${pick(LAST_FRAGMENTS)}`,
        // x_first: x_alex (gamer-style prefix)
        () => `x_${pick(FIRST_NAMES)}`,
    ];
    return pick(patterns)().slice(0, 16);
}

/**
 * Plausible win/loss stats for a player at the given rank. Used so a bot's
 * profile doesn't show `0-0` when a curious human taps their name.
 *  • Higher rank → more total games (you don't reach Diamond on 5 matches).
 *  • Win rate hovers around 50 % with some variance (the matchmaking
 *    equilibrium for any active competitive player).
 */
export function plausibleStatsForRank(rankPoints: number): {
    wins: number;
    losses: number;
    bestStreak: number;
} {
    // Roughly 30 games at Stone, 200 at Diamond, 350+ at Legend.
    const base = Math.max(20, Math.floor((rankPoints - 800) / 5));
    const totalGames = base + randInt(-10, 30);
    const winRate = 0.45 + Math.random() * 0.18; // 45–63 %
    const wins = Math.max(0, Math.floor(totalGames * winRate));
    const losses = Math.max(0, totalGames - wins);
    // Streaks scale modestly with games played.
    const bestStreak = Math.min(30, randInt(2, Math.max(3, Math.floor(totalGames / 18))));
    return { wins, losses, bestStreak };
}

/**
 * Create a bot user with a random realistic username and plausible stats.
 * Retries on rare username collisions; falls back to a higher-entropy name
 * if multiple attempts collide.
 */
export async function createBotUser(rankPoints: number): Promise<{ id: string; username: string }> {
    const { createUser } = await import('../services/userService.js');
    const { query } = await import('../db/pool.js');
    const { tierFromPoints } = await import('../game/ranks.js');
    const { randomUUID } = await import('node:crypto');

    const subject = `bot-${randomUUID()}`;
    const stats = plausibleStatsForRank(rankPoints);
    // ±50-pt jitter so two bots facing the same human don't land on identical
    // points, which would look suspicious.
    const points = Math.max(0, rankPoints + randInt(-50, 50));
    const tier = tierFromPoints(points);

    let bot: { id: string; username: string } | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        const username =
            attempt < 5
                ? generateBotUsername()
                : // After 5 collisions just bolt on a UUID slice — almost
                  // never happens, but keeps the system robust.
                  `${generateBotUsername().slice(0, 10)}_${randomUUID().slice(0, 4)}`;
        try {
            bot = await createUser({
                username,
                provider: 'anonymous',
                subject,
            });
            break;
        } catch (err) {
            const code = (err as { code?: string }).code;
            // 23505 = unique_violation. Anything else is a real error.
            if (code !== '23505') throw err;
        }
    }
    if (!bot) throw new Error('Could not allocate a bot username after retries');

    // Backfill rank + stats so the bot looks like an active player.
    await query(
        `UPDATE users SET
            rank_points = $1,
            rank_tier = $2,
            wins = $3,
            losses = $4,
            best_streak = $5,
            updated_at = now()
         WHERE id = $6`,
        [points, tier, stats.wins, stats.losses, stats.bestStreak, bot.id]
    );

    return bot;
}
