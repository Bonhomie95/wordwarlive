import { describe, it, expect, afterAll } from 'vitest';
import { hasDb, mongo, useDb } from './db.js';

describe.skipIf(!hasDb)('persisted synthetic schedules', () => {
    useDb();
    const day = '2099-12-28';
    const versions: string[] = [];
    afterAll(async () => {
        const { col } = await mongo();
        await col('synthetic_days').deleteMany({ day });
        await col('synthetic_config_versions').deleteMany({ id: { $in: versions } });
    });
    it('does not rewrite a materialized schedule when its configuration changes', async () => {
        const { col, newId } = await mongo();
        const { defaults, ensureSyntheticDay } = await import('../../src/services/syntheticHistory.js');
        const version = async (settings: typeof defaults, reason: string, created_at: Date) => {
            const id = newId();
            versions.push(id);
            await col('synthetic_config_versions').insertOne({ id, effective_day: day, settings, created_at, actor_id: null, reason });
            return id;
        };
        const first = await version(defaults, 'QA fixture', new Date());
        const original = await ensureSyntheticDay(day);
        expect(original.ranked.length).toBeGreaterThan(0);
        await version({ ...defaults, population: 0 }, 'QA changed fixture', new Date(Date.now() + 1000));
        expect(await ensureSyntheticDay(day)).toEqual(original);
        const stored = await col('synthetic_days').findOne({ day }, { projection: { _id: 0, version_id: 1, algorithm_version: 1 } });
        expect(stored).toEqual({ version_id: first, algorithm_version: 3 });
    });
});
