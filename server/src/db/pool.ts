import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
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
