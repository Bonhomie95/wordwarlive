import { Pool, type PoolClient } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Don't let a pathological query pin a pooled connection forever.
    statement_timeout: 15_000,
    query_timeout: 15_000,
});

pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle Postgres client');
});

/** Helper for short-lived queries. Use a transaction (`pool.connect()`) for
 *  multi-statement work. */
export async function query<T = any>(
    text: string,
    params?: unknown[]
): Promise<T[]> {
    const result = await pool.query(text, params);
    return result.rows as T[];
}

/** Compose related writes atomically; nested services reuse the caller's client. */
export async function transaction<T>(work: (client: PoolClient) => Promise<T>, existing?: PoolClient): Promise<T> {
    if (existing) return work(existing);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
