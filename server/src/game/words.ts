// Server-authoritative word bank with in-memory caching. We load all words
// at boot (a few thousand strings is nothing) so guess validation never has
// to hit the DB on the hot path.

import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

interface WordEntry {
    word: string;
    length: number;
    difficulty: number;
}

const byLength: Map<number, string[]> = new Map();
const wordSet: Set<string> = new Set();
const difficultyByWord: Map<string, number> = new Map();

let loaded = false;

export async function loadWordBank(): Promise<void> {
    const rows = await query<WordEntry>(
        'SELECT word, length, difficulty FROM word_bank'
    );

    for (const row of rows) {
        const w = row.word.toUpperCase();
        wordSet.add(w);
        difficultyByWord.set(w, row.difficulty);
        const arr = byLength.get(row.length) ?? [];
        arr.push(w);
        byLength.set(row.length, arr);
    }

    loaded = true;
    logger.info(
        {
            total: wordSet.size,
            byLength: Object.fromEntries(
                [...byLength.entries()].map(([len, arr]) => [len, arr.length])
            ),
        },
        'Word bank loaded'
    );
}

function ensureLoaded() {
    if (!loaded) {
        throw new Error('Word bank not loaded. Call loadWordBank() at boot.');
    }
}

export function isValidWord(word: string): boolean {
    ensureLoaded();
    return wordSet.has(word.toUpperCase());
}

export function getDifficulty(word: string): number {
    ensureLoaded();
    return difficultyByWord.get(word.toUpperCase()) ?? 3;
}

/** Random word of a given length. Throws if no words of that length exist. */
export function pickRandomWord(length: number): string {
    ensureLoaded();
    const arr = byLength.get(length);
    if (!arr || arr.length === 0) {
        throw new Error(`No words available of length ${length}`);
    }
    return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Random word with rank-aware length selection. Higher ranks get longer
 * words. The 4-10 letter range gives us a wider strategic spread:
 *   - 4-letter words are quick to type but harder to triangulate (less
 *     letter information per guess);
 *   - 9-10 letter words give more letter info per guess but are slower
 *     to type and require more strategic thinking.
 */
export function pickRankAwareWord(rankPoints: number): string {
    ensureLoaded();
    let candidates: number[];
    if (rankPoints < 1100) candidates = [4, 5];
    else if (rankPoints < 1300) candidates = [5, 6];
    else if (rankPoints < 1500) candidates = [5, 6, 7];
    else if (rankPoints < 1700) candidates = [6, 7, 8];
    else if (rankPoints < 1900) candidates = [7, 8, 9];
    else if (rankPoints < 2100) candidates = [8, 9, 10];
    else candidates = [9, 10];

    // Filter to lengths that actually have any words loaded.
    candidates = candidates.filter((len) => (byLength.get(len)?.length ?? 0) > 0);
    if (candidates.length === 0) {
        // Fallback to whatever's loaded — should never happen in practice.
        const fallback = [...byLength.keys()].filter(
            (k) => (byLength.get(k)?.length ?? 0) > 0
        );
        if (fallback.length === 0) throw new Error('Word bank is empty');
        return pickRandomWord(fallback[0]!);
    }

    const length = candidates[Math.floor(Math.random() * candidates.length)]!;
    return pickRandomWord(length);
}
