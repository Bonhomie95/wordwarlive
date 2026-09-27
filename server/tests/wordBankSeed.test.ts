import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeWordBank } from '../src/game/wordBankSeed.js';

describe('word bank seed', () => {
    it('deduplicates case/space variants across buckets and calculates actual lengths', () => {
        expect(normalizeWordBank({ '4': [' apple ', 'APPLE'], '8': ['apple', 'WELCOME'] }))
            .toEqual([{ word: 'APPLE', length: 5 }, { word: 'WELCOME', length: 7 }]);
    });
    it('rejects malformed and unsupported-length words', () => {
        for (const word of ['CAT', 'HELLO-WORLD', 'HELLO WORLD', 'ABCDEFGHIJK']) {
            expect(() => normalizeWordBank({ '5': [word] })).toThrow('Invalid word-bank entry');
        }
    });
    it('ships unique uppercase words in correct length buckets', () => {
        const bank = JSON.parse(readFileSync(new URL('../src/data/words.json', import.meta.url), 'utf8')) as Record<string, string[]>;
        const normalized = normalizeWordBank(bank);
        expect(normalized.length).toBe(Object.values(bank).flat().length);
        for (const [length, words] of Object.entries(bank)) {
            expect(words.every((word) => /^[A-Z]{4,10}$/.test(word) && word.length === Number(length))).toBe(true);
        }
    });
});
