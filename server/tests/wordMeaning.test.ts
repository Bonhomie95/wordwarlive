import { describe, it, expect } from 'vitest';
import { pickMeaning } from '../src/services/wordMeaningService.js';

describe('pickMeaning (dictionary API → results-screen line)', () => {
    it('takes the first definition with its part of speech', () => {
        const api = [{ meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A self-evident axiom or premise.' }] }] }];
        expect(pickMeaning(api)).toEqual({ partOfSpeech: 'noun', definition: 'A self-evident axiom or premise.' });
    });

    it('skips empty definitions and trims long ones at a word boundary', () => {
        const long = 'word '.repeat(60).trim();
        const api = [{ meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: ' ' }] }, { partOfSpeech: 'noun', definitions: [{ definition: long }] }] }];
        const got = pickMeaning(api)!;
        expect(got.partOfSpeech).toBe('noun');
        expect(got.definition.length).toBeLessThanOrEqual(141);
        expect(got.definition.endsWith('word…')).toBe(true);
    });

    it('returns null for anything else', () => {
        expect(pickMeaning(null)).toBeNull();
        expect(pickMeaning({ title: 'No Definitions Found' })).toBeNull();
        expect(pickMeaning([{ meanings: [] }])).toBeNull();
    });
});
