// Short meanings for answer words, shown on the results screen. Looked up
// once per word from Wiktionary's REST API (CC BY-SA: the app credits
// Wiktionary) and cached in Mongo, misses included, so each word costs at
// most one outside call. Network errors aren't cached. (dictionaryapi.dev
// answers 403 to Render's servers, so we go to the source.)

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

interface WiktionarySense {
    partOfSpeech?: string;
    definitions?: { definition?: string }[];
}

const MAX_LEN = 140;
// Wikimedia asks API clients to identify themselves with a contact URL.
const USER_AGENT = 'WordWarGame/1.0 (https://apps.apple.com/app/id6832551406)';

/** Wiktionary definitions are HTML; keep the top-level sense as text
 *  (no style blocks, no nested sub-senses or quotations). */
function plainText(html: string): string {
    return html
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
        .replace(/<(ol|ul|dl)[\s>][\s\S]*$/i, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

/** The first English definition, trimmed for a phone card. */
export function pickMeaning(json: unknown): { partOfSpeech: string | null; definition: string } | null {
    const senses = (json as { en?: WiktionarySense[] } | null)?.en;
    if (!Array.isArray(senses)) return null;
    for (const sense of senses) {
        for (const d of sense.definitions ?? []) {
            const text = typeof d.definition === 'string' ? plainText(d.definition) : '';
            if (!text) continue;
            const definition =
                text.length <= MAX_LEN ? text : `${text.slice(0, text.lastIndexOf(' ', MAX_LEN - 1) || MAX_LEN - 1).replace(/[,;:]$/, '')}…`;
            return { partOfSpeech: sense.partOfSpeech?.toLowerCase() ?? null, definition };
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
        const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.toLowerCase())}`, {
            headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
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
