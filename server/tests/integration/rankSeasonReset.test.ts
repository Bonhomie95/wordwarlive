import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// A private schema prevents test seasons from resetting real local players.
// Relative DB timestamps make these tests independent of CI's calendar date.
const { schema } = vi.hoisted(() => ({ schema: `qa_rank_${Math.random().toString(16).slice(2)}` }));
vi.mock('../../src/config/env.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../src/config/env.js')>();
    const url = new URL(original.env.DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    return { ...original, env: { ...original.env, DATABASE_URL: url.toString() } };
});

describe.skipIf(!process.env.DATABASE_URL)('rank reset with isolated season fixtures', () => {
    let setup: pg.Pool;
    let pool: typeof import('../../src/db/pool.js').pool;
    let applyReset: typeof import('../../src/services/rankSeasonService.js').applyResetIfNeeded;

    beforeAll(async () => {
        setup = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        await setup.query(`CREATE SCHEMA ${schema}`);
        await setup.query(`
            CREATE TABLE ${schema}.rank_seasons (
                id integer PRIMARY KEY, name text NOT NULL,
                starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
                soft_reset_delta integer NOT NULL
            );
            CREATE TABLE ${schema}.users (
                id uuid PRIMARY KEY, rank_points integer NOT NULL,
                rank_tier text NOT NULL, last_rank_season_reset_id integer,
                updated_at timestamptz DEFAULT now()
            );
            CREATE TABLE ${schema}.rank_season_results (
                season_id integer, user_id uuid, peak_points integer,
                final_points integer, final_tier text,
                PRIMARY KEY (season_id, user_id)
            );
        `);
        ({ pool } = await import('../../src/db/pool.js'));
        ({ applyResetIfNeeded: applyReset } = await import('../../src/services/rankSeasonService.js'));
    });

    afterAll(async () => {
        if (pool) await pool.end();
        if (setup) {
            await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
            await setup.end();
        }
    });

    it('does nothing when no ranked season is active', async () => {
        expect(await applyReset(randomUUID())).toEqual({ resetApplied: false });
    });

    it('concurrent requests reset once, update the tier, and retain the prior peak', async () => {
        await pool.query(`INSERT INTO rank_seasons VALUES
            (1, 'Previous', now() - interval '2 days', now() - interval '1 day', 200),
            (2, 'Current', now() - interval '1 hour', now() + interval '1 day', 200)`);
        const id = randomUUID();
        await pool.query("INSERT INTO users (id, rank_points, rank_tier, last_rank_season_reset_id) VALUES ($1, 1500, 'gold', 1)", [id]);
        await pool.query("INSERT INTO rank_season_results VALUES (1, $1, 1700, 1500, 'gold')", [id]);
        const results = await Promise.all(Array.from({ length: 6 }, () => applyReset(id)));
        expect(results.filter((r) => r.resetApplied)).toHaveLength(1);
        expect((await pool.query('SELECT rank_points, rank_tier, last_rank_season_reset_id FROM users WHERE id = $1', [id])).rows[0])
            .toEqual({ rank_points: 1300, rank_tier: 'silver', last_rank_season_reset_id: 2 });
        expect((await pool.query('SELECT peak_points, final_points FROM rank_season_results WHERE user_id = $1', [id])).rows[0])
            .toEqual({ peak_points: 1700, final_points: 1500 });
    });

    it('does not raise a player already below the reset floor', async () => {
        const id = randomUUID();
        await pool.query("INSERT INTO users (id, rank_points, rank_tier) VALUES ($1, 850, 'stone')", [id]);
        expect((await applyReset(id)).resetApplied).toBe(true);
        expect((await pool.query('SELECT rank_points FROM users WHERE id = $1', [id])).rows[0].rank_points).toBe(850);
    });
});
