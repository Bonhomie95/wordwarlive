import { describe, it, expect } from 'vitest';
import { containsProfanity, moderationError } from '../src/moderation/blocklist.js';

describe('containsProfanity', () => {
    it('flags obvious slurs and profanity', () => {
        expect(containsProfanity('fuckyou')).toBe(true);
        expect(containsProfanity('a_bitch_99')).toBe(true);
    });

    it('catches simple leetspeak evasion', () => {
        expect(containsProfanity('sh1t')).toBe(true);
        expect(containsProfanity('f4ggot')).toBe(true);
    });

    it('does not flag innocent names (no Scunthorpe false positives)', () => {
        for (const ok of ['player_123', 'wordwizard', 'grandmaster', 'assistant_pro', 'analyst']) {
            expect(containsProfanity(ok)).toBe(false);
        }
    });
});

describe('moderationError', () => {
    it('returns a reason for bad content and null for clean', () => {
        expect(moderationError('shithead')).toBeTypeOf('string');
        expect(moderationError('cleanname')).toBeNull();
    });
});
