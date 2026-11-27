// Short meanings for answer words, shown on the results screen. Looked up
// once per word from the Free Dictionary API (Wiktionary text, CC BY-SA 3.0:
// the app credits Wiktionary) and cached in Mongo, misses included, so each
// word costs at most one outside call. Network errors aren't cached.

import { col, registerIndexes } from '../db/mongo.js';
import { logger } from '../utils/logger.js';

registerIndexes('word_meanings', [{ key: { word: 1 }, unique: true }]);

export interface WordMeaning {
    word: string;
    partOfSpeech: string | null;
    definition: string;
}

interface MeaningDoc {
    word: string;
    part_of_speech: string | null;
    /** null = the dictionary has no entry (don't ask again). */
    definition: string | null;
    fetched_at: Date;
}

interface ApiEntry {
    meanings?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[];
}

const MAX_LEN = 140;

/** The first definition from the API's entries, trimmed for a phone card. */
export function pickMeaning(entries: unknown): { partOfSpeech: string | null; definition: string } | null {
    if (!Array.isArray(entries)) return null;
    for (const entry of entries as ApiEntry[]) {
        for (const m of entry.meanings ?? []) {
            const text = m.definitions?.find((d) => typeof d.definition === 'string' && d.definition.trim())?.definition?.trim();
            if (!text) continue;
            const definition = text.length <= MAX_LEN ? text : `${text.slice(0, text.lastIndexOf(' ', MAX_LEN - 1) || MAX_LEN - 1).replace(/[,;:]$/, '')}…`;
            return { partOfSpeech: m.partOfSpeech ?? null, definition };
        }
    }
    return null;
}

export async function meaningFor(rawWord: string): Promise<WordMeaning | null> {
    const word = rawWord.toUpperCase();
    const meanings = col<MeaningDoc>('word_meanings');
    const cached = await meanings.findOne({ word }, { projection: { _id: 0 } });
    if (cached) return cached.definition ? { word, partOfSpeech: cached.part_of_speech, definition: cached.definition } : null;

    let picked: ReturnType<typeof pickMeaning>;
    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`, {
            signal: AbortSignal.timeout(4000),
        });
        if (res.status === 404) picked = null;
        else if (!res.ok) throw new Error(`dictionary returned ${res.status}`);
        else picked = pickMeaning(await res.json());
    } catch (err) {
        logger.warn({ err, word }, 'word meaning lookup failed');
        return null; // transient: try again next time
    }
    await meanings.updateOne(
        { word },
        { $setOnInsert: { word, part_of_speech: picked?.partOfSpeech ?? null, definition: picked?.definition ?? null, fetched_at: new Date() } },
        { upsert: true }
    );
    return picked ? { word, ...picked } : null;
}
