import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasDb, mongo, useDb } from './db.js';

const FIELDS = { _id: 0, rank_points: 1, coins: 1, wins: 1, play_streak: 1, battle_pass_xp: 1 } as const;

describe.skipIf(!hasDb)('settlement atomicity', () => {
    useDb();
    let id: string | undefined;
    afterAll(async () => {
        if (id) await (await import('../../src/services/userService.js')).deleteAccount(id);
    });

    // ponytail ceiling in db/mongo.ts: inTransactionScope() just runs the callback, nothing is rolled back.
    it.skip('rolls back every reward when settlement fails after multiple services write', async () => {
        const { col, inTransactionScope } = await mongo();
        const { createUser, applyMatchResult } = await import('../../src/services/userService.js');
        const { grantCoins } = await import('../../src/services/coinsService.js');
        const { advanceStreakOnMatchComplete } = await import('../../src/services/streakService.js');
        const { awardMatchXp } = await import('../../src/services/battlePassService.js');
        const { recordMatchResult } = await import('../../src/services/leaderboardService.js');
        const user = await createUser({
            username: 'qa_atomic_' + randomUUID().slice(0, 5),
            provider: 'anonymous',
            subject: randomUUID(),
        });
        id = user.id;
        const original = await col('users').findOne({ id }, { projection: FIELDS });
        await expect(
            inTransactionScope(async () => {
                await applyMatchResult({ userId: user.id, isWinner: true, rankDelta: 15 });
                await grantCoins({ userId: user.id, amount: 100, source: 'match_win' });
                await advanceStreakOnMatchComplete(user.id);
                await awardMatchXp({ userId: user.id, result: 'win' });
                await recordMatchResult({ userId: user.id, isWin: true, rankPoints: 1015, mode: 'classic' });
                throw new Error('Injected settlement interruption');
            }),
        ).rejects.toThrow('Injected settlement interruption');
        expect(await col('users').findOne({ id }, { projection: FIELDS })).toEqual(original);
        expect(await col('coin_grants').countDocuments({ user_id: id })).toBe(0);
        expect(await col('leaderboard_entries').countDocuments({ user_id: id })).toBe(0);
    });
});
