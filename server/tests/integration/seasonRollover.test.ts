import { describe, it, expect, afterAll } from 'vitest';
import { hasDb, mongo, useDb } from './db.js';

// The battle pass must always have a running season, or XP lands nowhere.
describe.skipIf(!hasDb)('battle pass season rollover', () => {
    useDb();
    const created: number[] = [];
    afterAll(async () => {
        const { col } = await mongo();
        await col('battle_pass_seasons').deleteMany({ season_number: { $in: created } });
        await col('battle_pass_rewards').deleteMany({ season_number: { $in: created } });
    });

    it('opens the next season with the same rewards once the current one ends', async () => {
        const { col } = await mongo();
        const { ensureActiveSeason, getCurrentSeason } = await import('../../src/services/battlePassService.js');
        const last = await col('battle_pass_seasons').findOne({}, { sort: { season_number: -1 } });
        const afterEnd = new Date(new Date(last!.ends_at).getTime() + 60_000);
        expect(await ensureActiveSeason(new Date())).toBeNull(); // seeded season still running

        const n = await ensureActiveSeason(afterEnd);
        created.push(n!);
        expect(n).toBe(last!.season_number + 1);
        expect(await ensureActiveSeason(afterEnd)).toBeNull(); // idempotent once open
        const rewardsOld = await col('battle_pass_rewards').countDocuments({ season_number: last!.season_number });
        expect(await col('battle_pass_rewards').countDocuments({ season_number: n })).toBe(rewardsOld);
        expect((await getCurrentSeason())?.season_number).toBe(last!.season_number); // today unchanged
    });
});
