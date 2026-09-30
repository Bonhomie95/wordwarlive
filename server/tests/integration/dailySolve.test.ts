// Solving the daily challenge grants coins exactly once. Self-skips
// without MONGODB_URL. Uses today's real challenge word (read straight from
// the collection) so nothing about the shared challenge is modified.

import { describe, it, expect, afterAll } from 'vitest';
import { hasDb, mongo, useDb } from './db.js';

describe.skipIf(!hasDb)('daily solve reward (integration)', () => {
    useDb();
    let userId: string | null = null;

    afterAll(async () => {
        if (!userId) return;
        const { col } = await mongo();
        await col('daily_challenge_attempts').deleteMany({ user_id: userId });
        await col('users').deleteOne({ id: userId });
    });

    it('grants DAILY_SOLVE_COINS on solve, refuses a second solve', async () => {
        const { col } = await mongo();
        const { createUser } = await import('../../src/services/userService.js');
        const { getCoinBalance } = await import('../../src/services/coinsService.js');
        const { getOrCreateTodaysChallenge, submitGuess, getMyAttempt, DAILY_SOLVE_COINS } =
            await import('../../src/services/dailyChallengeService.js');
        const { loadWordBank } = await import('../../src/game/words.js');
        await loadWordBank();

        const u = await createUser({
            username: `dly_${Date.now().toString(36).slice(-7)}`,
            provider: 'anonymous',
            subject: `daily-test-${Date.now()}-${Math.random()}`,
        });
        userId = u.id;

        const { challengeDate } = await getOrCreateTodaysChallenge();
        const row = await col<{ word: string }>('daily_challenges').findOne({ challenge_date: challengeDate });
        const word = row!.word;

        const before = await getCoinBalance(u.id);
        const r = await submitGuess(u.id, word);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.solved).toBe(true);
        expect(r.coinsAwarded).toBe(DAILY_SOLVE_COINS);
        expect(await getCoinBalance(u.id)).toBe(before + DAILY_SOLVE_COINS);
        expect((await getMyAttempt(u.id))?.coinsAwarded).toBe(DAILY_SOLVE_COINS);

        const again = await submitGuess(u.id, word);
        expect(again.ok).toBe(false);
        if (!again.ok) expect(again.errorCode).toBe('ALREADY_SOLVED');
        expect(await getCoinBalance(u.id)).toBe(before + DAILY_SOLVE_COINS);
    });
});
