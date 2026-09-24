// Solving the daily challenge grants coins exactly once. Self-skips
// without DATABASE_URL. Uses today's real challenge word (read straight from
// the table) so nothing about the shared challenge is modified.

import { describe, it, expect, afterAll } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('daily solve reward (integration)', () => {
    let pool: typeof import('../../src/db/pool.js').pool;
    let userId: string | null = null;

    afterAll(async () => {
        if (pool) {
            if (userId) {
                await pool.query('DELETE FROM daily_challenge_attempts WHERE user_id = $1', [userId]);
                await pool.query('DELETE FROM users WHERE id = $1', [userId]);
            }
            await pool.end();
        }
    });

    it('grants DAILY_SOLVE_COINS on solve, refuses a second solve', async () => {
        ({ pool } = await import('../../src/db/pool.js'));
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
        const { rows } = await pool.query<{ word: string }>(
            'SELECT word FROM daily_challenges WHERE challenge_date = $1',
            [challengeDate]
        );
        const word = rows[0]!.word;

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
