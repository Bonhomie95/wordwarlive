import { it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool, inTransactionScope } from '../../src/db/pool.js';
import { redis } from '../../src/db/redis.js';
import { createUser, deleteAccount, applyMatchResult } from '../../src/services/userService.js';
import { grantCoins } from '../../src/services/coinsService.js';
import { advanceStreakOnMatchComplete } from '../../src/services/streakService.js';
import { awardMatchXp } from '../../src/services/battlePassService.js';
import { recordMatchResult } from '../../src/services/leaderboardService.js';
let id: string | undefined;
afterAll(async () => {
    if (id) await deleteAccount(id);
    await pool.end();
    redis.disconnect();
});
it.skipIf(!process.env.DATABASE_URL)(
    'rolls back every reward when settlement fails after multiple services write',
    async () => {
        const user = await createUser({
            username: 'qa_atomic_' + randomUUID().slice(0, 5),
            provider: 'anonymous',
            subject: randomUUID(),
        });
        id = user.id;
        const original = (
            await pool.query(
                'SELECT rank_points,coins,wins,play_streak,battle_pass_xp FROM users WHERE id=$1',
                [id],
            )
        ).rows[0];
        await expect(
            inTransactionScope(async () => {
                await applyMatchResult({ userId: user.id, isWinner: true, rankDelta: 15 });
                await grantCoins({ userId: user.id, amount: 100, source: 'match_win' });
                await advanceStreakOnMatchComplete(user.id);
                await awardMatchXp({ userId: user.id, result: 'win' });
                await recordMatchResult({
                    userId: user.id,
                    isWin: true,
                    rankPoints: 1015,
                    mode: 'classic',
                });
                throw new Error('Injected settlement interruption');
            }),
        ).rejects.toThrow('Injected settlement interruption');
        expect(
            (
                await pool.query(
                    'SELECT rank_points,coins,wins,play_streak,battle_pass_xp FROM users WHERE id=$1',
                    [id],
                )
            ).rows[0],
        ).toEqual(original);
        expect(
            (await pool.query('SELECT count(*)::int n FROM coin_grants WHERE user_id=$1', [id]))
                .rows[0].n,
        ).toBe(0);
        expect(
            (
                await pool.query(
                    'SELECT count(*)::int n FROM leaderboard_entries WHERE user_id=$1',
                    [id],
                )
            ).rows[0].n,
        ).toBe(0);
    },
);
