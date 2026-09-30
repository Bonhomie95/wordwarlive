// MongoDB access. One shared client; collections mirror the old Postgres
// tables (same collection names, same snake_case field names) so service row
// types and the API shapes are unchanged.

import { randomUUID } from 'node:crypto';
import {
    MongoClient,
    type Collection,
    type Db,
    type Document,
    type IndexDescription,
} from 'mongodb';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const client = new MongoClient(env.MONGODB_URL, {
    maxPoolSize: env.DB_POOL_MAX,
    serverSelectionTimeoutMS: 5_000,
});

/** Database named by the connection string path (`/wordwar`). */
export const db: Db = client.db();

export function col<T extends Document = Document>(name: string): Collection<T> {
    return db.collection<T>(name);
}

/** Replacement for Postgres `gen_random_uuid()` defaults. */
export const newId = (): string => randomUUID();

/** `CURRENT_DATE` as the `YYYY-MM-DD` string we store for date columns. */
export const todayStr = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

// ─── Index registry ─────────────────────────────────────────────────────────
// Each service registers the indexes it relies on next to its queries;
// ensureIndexes() applies them all at boot (idempotent).
const registry: Array<{ collection: string; indexes: IndexDescription[] }> = [];

export function registerIndexes(collection: string, indexes: IndexDescription[]): void {
    registry.push({ collection, indexes });
}

export async function ensureIndexes(): Promise<void> {
    for (const { collection, indexes } of registry) {
        if (indexes.length) await col(collection).createIndexes(indexes);
    }
}

export async function connectMongo(): Promise<void> {
    await client.connect();
    await db.command({ ping: 1 });
    logger.info({ db: db.databaseName }, 'MongoDB connected');
}

export async function closeMongo(): Promise<void> {
    await client.close();
}

// ─── Transactions ───────────────────────────────────────────────────────────
// ponytail: multi-document atomicity is NOT enforced; `work` just runs. Upgrade
// to client.startSession() + withTransaction (Atlas is a replica set) and
// thread the session through the collection calls if settlement races matter.
export async function transaction<T>(work: (client?: undefined) => Promise<T>, _existing?: unknown): Promise<T> {
    return work(undefined);
}
export async function inTransactionScope<T>(work: () => Promise<T>): Promise<T> {
    return work();
}
