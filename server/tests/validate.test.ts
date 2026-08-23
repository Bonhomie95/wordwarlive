import { describe, it, expect } from 'vitest';
import {
    parse,
    powerUpSchema,
    guessSubmitSchema,
    emojiSchema,
    privateJoinSchema,
    friendChallengeSchema,
} from '../src/socket/validate.js';

describe('socket payload validation', () => {
    describe('powerUpSchema (SQL-injection guard)', () => {
        it('accepts the three whitelisted kinds', () => {
            for (const kind of ['reveal', 'scramble', 'lock']) {
                expect(parse(powerUpSchema, { kind })).toEqual({ kind });
            }
        });

        it('rejects a SQL-injection payload in kind', () => {
            const malicious = {
                kind: 'reveal = 99, coins = 999999 WHERE id = $1 --',
            };
            expect(parse(powerUpSchema, malicious)).toBeNull();
        });

        it('rejects arbitrary / missing kinds', () => {
            expect(parse(powerUpSchema, { kind: 'delete' })).toBeNull();
            expect(parse(powerUpSchema, {})).toBeNull();
            expect(parse(powerUpSchema, { kind: 123 })).toBeNull();
            expect(parse(powerUpSchema, null)).toBeNull();
        });

        it('accepts an optional numeric targetGuessIndex', () => {
            expect(parse(powerUpSchema, { kind: 'reveal', targetGuessIndex: 2 })).toEqual({
                kind: 'reveal',
                targetGuessIndex: 2,
            });
            expect(parse(powerUpSchema, { kind: 'reveal', targetGuessIndex: -1 })).toBeNull();
        });
    });

    describe('guessSubmitSchema', () => {
        it('accepts a normal guess', () => {
            expect(parse(guessSubmitSchema, { guess: 'CRANE' })).toEqual({ guess: 'CRANE' });
        });
        it('rejects empty / oversized / non-string guesses', () => {
            expect(parse(guessSubmitSchema, { guess: '' })).toBeNull();
            expect(parse(guessSubmitSchema, { guess: 'X'.repeat(64) })).toBeNull();
            expect(parse(guessSubmitSchema, { guess: 5 })).toBeNull();
        });
    });

    describe('emojiSchema', () => {
        it('accepts a short string', () => {
            expect(parse(emojiSchema, { emoji: '🔥' })).toEqual({ emoji: '🔥' });
        });
        it('rejects oversized payloads', () => {
            expect(parse(emojiSchema, { emoji: 'x'.repeat(100) })).toBeNull();
        });
    });

    describe('privateJoinSchema', () => {
        it('accepts a code', () => {
            expect(parse(privateJoinSchema, { code: 'ABC123' })).toEqual({ code: 'ABC123' });
        });
        it('rejects missing code', () => {
            expect(parse(privateJoinSchema, {})).toBeNull();
        });
    });

    describe('friendChallengeSchema', () => {
        it('requires a uuid friendId', () => {
            expect(
                parse(friendChallengeSchema, {
                    friendId: '11111111-1111-4111-8111-111111111111',
                })
            ).toEqual({ friendId: '11111111-1111-4111-8111-111111111111' });
            expect(parse(friendChallengeSchema, { friendId: 'not-a-uuid' })).toBeNull();
        });
    });
});
