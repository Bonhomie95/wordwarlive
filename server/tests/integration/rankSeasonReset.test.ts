import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasDb, mongo, useDb } from './db.js';

// Fixture seasons use ids far above the seeded ones and are removed after
// the run. Relative timestamps make these tests independent of the calendar.
const PREV = 9001;
const CUR = 9002;

describe.skipIf(!hasDb)('rank reset with isolated season fixtures', () => {
    useDb();
    let col: Awaited<ReturnType<typeof mongo>>['col'];
    let applyReset: typeof import('../../src/services/rankSeasonService.js').applyResetIfNeeded;
    const userIds: string[] = [];

    async function cleanup() {
        await col('rank_seasons').deleteMany({ id: { $in: [PREV, CUR] } });
        const { deleteAccount } = await import('../../src/services/userService.js');
        for (const id of userIds) await deleteAccount(id);
    }

    /** A real user (satisfies every unique index) with the rank fields overridden. */
    async function fixtureUser(fields: Record<string, unknown>): Promise<string> {
        const { createUser } = await import('../../src/services/userService.js');
        const u = await createUser({ username: `rk_${randomUUID().slice(0, 8)}`, provider: 'anonymous', subject: `rank-${randomUUID()}` });
        userIds.push(u.id);
        await col('users').updateOne({ id: u.id }, { $set: fields });
        return u.id;
    }

    beforeAll(async () => {
        ({ col } = await mongo());
        ({ applyResetIfNeeded: applyReset } = await import('../../src/services/rankSeasonService.js'));
        await cleanup();
    });

    afterAll(cleanup);

    it('does nothing when no ranked season is active', async () => {
        expect(await applyReset(randomUUID())).toEqual({ resetApplied: false });
    });

    it('concurrent requests reset once, update the tier, and retain the prior peak', async () => {
        const now = Date.now();
        const H = 3_600_000;
        await col('rank_seasons').insertMany([
            { id: PREV, name: 'Previous', starts_at: new Date(now - 48 * H), ends_at: new Date(now - 24 * H), soft_reset_delta: 200, created_at: new Date(now) },
            { id: CUR, name: 'Current', starts_at: new Date(now - H), ends_at: new Date(now + 24 * H), soft_reset_delta: 200, created_at: new Date(now) },
        ]);
        const id = await fixtureUser({ rank_points: 1500, rank_tier: 'gold', last_rank_season_reset_id: PREV });
        await col('rank_season_results').insertOne({ season_id: PREV, user_id: id, peak_points: 1700, final_points: 1500, final_tier: 'gold', rewarded: false });
        const results = await Promise.all(Array.from({ length: 6 }, () => applyReset(id)));
        expect(results.filter((r) => r.resetApplied)).toHaveLength(1);
        expect(await col('users').findOne({ id }, { projection: { _id: 0, rank_points: 1, rank_tier: 1, last_rank_season_reset_id: 1 } }))
            .toEqual({ rank_points: 1300, rank_tier: 'silver', last_rank_season_reset_id: CUR });
        expect(await col('rank_season_results').findOne({ user_id: id }, { projection: { _id: 0, peak_points: 1, final_points: 1 } }))
            .toEqual({ peak_points: 1700, final_points: 1500 });
    });

    it('does not raise a player already below the reset floor', async () => {
        const id = await fixtureUser({ rank_points: 850, rank_tier: 'stone', last_rank_season_reset_id: null });
        expect((await applyReset(id)).resetApplied).toBe(true);
        expect((await col('users').findOne({ id }))!.rank_points).toBe(850);
    });
});
