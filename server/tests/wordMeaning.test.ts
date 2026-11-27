import { describe, it, expect } from 'vitest';
import { pickMeaning } from '../src/services/wordMeaningService.js';

describe('pickMeaning (Wiktionary REST → results-screen line)', () => {
    it('takes the first English definition as plain text with its part of speech', () => {
        const api = {
            en: [
                {
                    partOfSpeech: 'Noun',
                    definitions: [
                        { definition: '<span class="usage-label-sense"></span> An <a href="/wiki/organism">organism</a> that is not an animal &amp; grows.' },
                    ],
                },
            ],
            fr: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'sole' }] }],
        };
        expect(pickMeaning(api)).toEqual({ partOfSpeech: 'noun', definition: 'An organism that is not an animal & grows.' });
    });

    it('drops style blocks and nested sub-senses', () => {
        const api = {
            en: [
                {
                    partOfSpeech: 'Verb',
                    definitions: [
                        { definition: 'To drink with relish. <style>.mw-parser-output .defdate{font-size:smaller}</style>' },
                    ],
                },
            ],
        };
        expect(pickMeaning(api)!.definition).toBe('To drink with relish.');
        const nested = { en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'Trailing portion.<ol><li>The back of a dress.</li></ol>' }] }] };
        expect(pickMeaning(nested)!.definition).toBe('Trailing portion.');
    });

    it('skips empty definitions and trims long ones at a word boundary', () => {
        const long = 'word '.repeat(60).trim();
        const api = { en: [{ partOfSpeech: 'Verb', definitions: [{ definition: '<span></span>' }] }, { partOfSpeech: 'Noun', definitions: [{ definition: long }] }] };
        const got = pickMeaning(api)!;
        expect(got.partOfSpeech).toBe('noun');
        expect(got.definition.length).toBeLessThanOrEqual(141);
        expect(got.definition.endsWith('word…')).toBe(true);
    });

    it('returns null when there is no English entry', () => {
        expect(pickMeaning(null)).toBeNull();
        expect(pickMeaning({ fr: [{ definitions: [{ definition: 'x' }] }] })).toBeNull();
        expect(pickMeaning({ en: [] })).toBeNull();
    });
});
