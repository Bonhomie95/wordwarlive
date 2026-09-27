import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ai/groq.js', () => ({ isGroqEnabled: () => false, groqJSON: vi.fn() }));
vi.mock('../src/game/words.js', () => ({ isValidWord: () => true, pickRandomWord: () => 'CRANE' }));
import { adaptiveDifficulty, chooseBotGuess, generateBotUsername, thinkTimeMs } from '../src/ai/bot.js';
import { scoreGuess } from '../src/game/engine.js';
afterEach(() => vi.restoreAllMocks());
describe('adaptive opponents', () => {
    it('changes at most one difficulty level for overlapping streak signals', () => {
        expect(adaptiveDifficulty(1000, { consecutiveWins: 5, consecutiveLosses: 0, recentWins: 5, recentTotal: 5 })).toBe('medium');
        expect(adaptiveDifficulty(2200, { consecutiveWins: 0, consecutiveLosses: 5, recentWins: 0, recentTotal: 5 })).toBe('medium');
    });
    it('keeps thinking time bounded and varies it with difficulty and word length', () => {
        for (const difficulty of ['easy', 'medium', 'hard'] as const) {
            for (const value of [0, 0.1, 0.5, 0.999]) {
                const ms = thinkTimeMs(difficulty, { wordLength: 10, random: () => value });
                expect(ms).toBeGreaterThanOrEqual(12000);
                expect(ms).toBeLessThanOrEqual(90000);
            }
        }
        const random = () => 0.5;
        expect(thinkTimeMs('easy', { random })).toBeGreaterThan(thinkTimeMs('hard', { random }));
        expect(thinkTimeMs('medium', { random, wordLength: 8 })).toBeGreaterThan(thinkTimeMs('medium', { random, wordLength: 5 }));
    });
    it('varies opening guesses instead of always choosing the first', async () => {
        const random = vi.spyOn(Math, 'random');
        const args = { wordLength: 5, history: [], difficulty: 'medium' as const, candidates: ['CRANE', 'SLATE', 'TRACE'] };
        random.mockReturnValue(0);
        expect(await chooseBotGuess(args)).toBe('CRANE');
        random.mockReturnValue(0.99);
        expect(await chooseBotGuess(args)).toBe('TRACE');
    });
    it('respects duplicate-letter feedback without repeating a previous guess', async () => {
        const history = [scoreGuess('LLAMA', 'ALLEY')];
        for (const difficulty of ['easy', 'medium', 'hard'] as const) {
            expect(await chooseBotGuess({ wordLength: 5, history, difficulty, candidates: ['LLAMA', 'APPLE', 'ALLEY', 'LEVEL'] })).toBe('ALLEY');
        }
    });
    it('keeps seeded usernames independent of global randomness', () => {
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
        const first = generateBotUsername(() => 0.4);
        random.mockReturnValue(0.1);
        expect(generateBotUsername(() => 0.4)).toBe(first);
        expect(random).not.toHaveBeenCalled();
    });
});
