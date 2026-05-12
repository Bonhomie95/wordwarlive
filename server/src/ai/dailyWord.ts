// Daily word selection. Picks a "featured" word for the calendar day from
// the curated word bank, with a single-line thematic blurb that's revealed
// to players post-game.
//
// We constrain Groq to choose from a curated candidate pool so we never
// end up serving a word that isn't in our bank. If Groq fails or isn't
// configured, we fall back to a deterministic random pick.

import { query } from '../db/pool.js';
import { groqJSON, isGroqEnabled } from './groq.js';
import { logger } from '../utils/logger.js';
import { pickRandomWord, isValidWord } from '../game/words.js';

interface DailyWordRow {
    day: string;
    word: string;
}

interface GroqDailyResponse {
    word: string;
    theme: string;
}

/** Returns YYYY-MM-DD in UTC for stable daily rollover. */
function todayKey(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Idempotently get today's daily word, picking and caching one if it's
 * not yet set. Safe to call from many places — concurrent first-callers
 * will race but only one row will land due to the PRIMARY KEY on `day`.
 */
export async function getOrPickDailyWord(): Promise<{ word: string; theme: string | null }> {
    const day = todayKey();

    const existing = await query<DailyWordRow & { theme: string | null }>(
        'SELECT day, word, NULL::text AS theme FROM daily_words WHERE day = $1',
        [day]
    );
    if (existing.length > 0) {
        return { word: existing[0]!.word, theme: null };
    }

    const candidates = await pickCandidates(20);
    let chosen: { word: string; theme: string };

    if (isGroqEnabled() && candidates.length > 0) {
        try {
            chosen = await pickWithGroq(candidates);
        } catch (err) {
            logger.warn({ err }, 'Groq daily-word selection failed; falling back to random');
            chosen = { word: candidates[0] ?? pickRandomWord(5), theme: '' };
        }
    } else {
        chosen = { word: candidates[0] ?? pickRandomWord(5), theme: '' };
    }

    // Defensive: don't trust Groq's word — verify it's in our bank.
    if (!isValidWord(chosen.word)) {
        logger.warn({ chosen }, 'Groq picked a word not in the bank; falling back');
        chosen = { word: candidates[0] ?? pickRandomWord(5), theme: chosen.theme };
    }

    await query(
        `INSERT INTO daily_words (day, word) VALUES ($1, $2)
         ON CONFLICT (day) DO NOTHING`,
        [day, chosen.word.toUpperCase()]
    );

    return { word: chosen.word.toUpperCase(), theme: chosen.theme || null };
}

async function pickCandidates(n: number): Promise<string[]> {
    // Pull a balanced sample across difficulty levels and lengths.
    const rows = await query<{ word: string }>(
        `SELECT word FROM word_bank
         WHERE length BETWEEN 5 AND 7
         ORDER BY random()
         LIMIT $1`,
        [n]
    );
    return rows.map((r) => r.word);
}

async function pickWithGroq(candidates: string[]): Promise<{ word: string; theme: string }> {
    const system = [
        'You are a curator picking the daily featured word for a competitive 1v1 word game.',
        'Pick exactly one word from the provided list — never invent words.',
        'Aim for variety: avoid obscure words, prefer ones with interesting letter patterns or meanings.',
        'Provide a one-sentence theme — at most 12 words — that hints at the word\'s vibe without revealing letters.',
        'Respond as a single JSON object: {"word": "<UPPERCASE>", "theme": "<one short sentence>"}.',
    ].join(' ');

    const user = `Candidates: ${candidates.join(', ')}\n\nPick the best one for today's daily word.`;

    return groqJSON<GroqDailyResponse>({
        system,
        user,
        temperature: 0.7,
        maxTokens: 200,
    });
}
