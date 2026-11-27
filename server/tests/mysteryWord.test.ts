import { describe, it, expect } from 'vitest';
import { mysteryWordError } from '../src/services/mysteryService.js';

// Lobby submissions and challenge words share this check. The word-list step
// needs the Mongo word bank (covered by the integration suite).
describe('mysteryWordError', () => {
    it('refuses non-letters and out-of-range lengths before the word list', () => {
        expect(mysteryWordError('PL4NT')).toBe('Letters only.');
        expect(mysteryWordError('')).toBe('Letters only.');
        expect(mysteryWordError('CAT')).toBe('Word must be 4-10 letters.');
        expect(mysteryWordError('ABCDEFGHIJK')).toBe('Word must be 4-10 letters.');
    });
});
