import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { redis } from '../../src/db/redis.js';
import { defaults, ensureSyntheticDay } from '../../src/services/syntheticHistory.js';
describe.skipIf(!process.env.DATABASE_URL)('persisted synthetic schedules', () => {
    const day = '2099-12-28';
    const versions: number[] = [];
    afterAll(async () => {
        await pool.query('DELETE FROM synthetic_days WHERE day=$1', [day]);
        await pool.query('DELETE FROM synthetic_config_versions WHERE id=ANY($1::bigint[])', [
            versions,
        ]);
        await pool.end();
        redis.disconnect();
    });
    it('does not rewrite a materialized schedule when its configuration changes', async () => {
        const first = await pool.query(
            "INSERT INTO synthetic_config_versions(effective_day,settings,reason) VALUES($1,$2,'QA fixture') RETURNING id",
            [day, JSON.stringify(defaults)],
        );
        versions.push(first.rows[0].id);
        const original = await ensureSyntheticDay(day);
        expect(original.ranked.length).toBeGreaterThan(0);
        const next = await pool.query(
            "INSERT INTO synthetic_config_versions(effective_day,settings,reason) VALUES($1,$2,'QA changed fixture') RETURNING id",
            [day, JSON.stringify({ ...defaults, population: 0 })],
        );
        versions.push(next.rows[0].id);
        expect(await ensureSyntheticDay(day)).toEqual(original);
        const stored = await pool.query(
            'SELECT version_id,algorithm_version FROM synthetic_days WHERE day=$1',
            [day],
        );
        expect(stored.rows[0].version_id).toBe(first.rows[0].id);
        expect(stored.rows[0].algorithm_version).toBe(3);
    });
});
