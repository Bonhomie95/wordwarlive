import { AsyncLocalStorage } from 'node:async_hooks';
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
    const result = await (transactionScope.getStore() ?? pool).query(text, params);
    return result.rows as T[];
}

/** Compose related writes atomically; nested services reuse the caller's client. */
export async function transaction<T>(work: (client: PoolClient) => Promise<T>, existing?: PoolClient): Promise<T> {
    const shared = existing ?? transactionScope.getStore();
    if (shared) return work(shared);
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


// Match settlement composes legacy services into one transaction. Ordinary
// callers keep their existing transaction boundaries; only this opt-in scope
// shares a connection. Child services cannot commit the parent's transaction.
const transactionScope = new AsyncLocalStorage<PoolClient>();
export async function inTransactionScope<T>(work: () => Promise<T>): Promise<T> {
    return transaction(client => transactionScope.run(client, work));
}
export async function connectTransactionClient(): Promise<PoolClient> {
    const shared = transactionScope.getStore();
    if (!shared) return pool.connect();
    return new Proxy(shared, {
        get(target, key) {
            if (key === 'release') return () => {};
            if (key === 'query') return (text: string, ...args: unknown[]) => {
                if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(text.trim())) return Promise.resolve({rows:[],rowCount:0});
                return Reflect.apply(target.query, target, [text, ...args]);
            };
            const value = Reflect.get(target,key);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}
