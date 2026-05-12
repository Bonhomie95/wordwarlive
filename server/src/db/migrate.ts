// Lightweight migration runner. Runs all *.sql files in /migrations in
// alphabetical order, tracking applied ones in a `_migrations` table.
// Then seeds the word bank from /src/data/words.json.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from './pool.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../migrations');
const WORDS_PATH = join(__dirname, '../data/words.json');

async function ensureMigrationsTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);
}

async function appliedMigrations(): Promise<Set<string>> {
    const rows = await query<{ name: string }>(
        'SELECT name FROM _migrations ORDER BY name'
    );
    return new Set(rows.map((r) => r.name));
}

async function applyMigration(name: string, sql: string) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations(name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        logger.info({ migration: name }, 'Applied migration');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function seedWordBank() {
    const raw = await readFile(WORDS_PATH, 'utf8');
    const data = JSON.parse(raw) as Record<string, string[]>;

    // Load currently-seeded words so we only insert what's actually new.
    // The original ON CONFLICT DO NOTHING handled correctness, but loading
    // the existing set lets us skip the work entirely when nothing changed.
    const existingRows = await query<{ word: string }>('SELECT word FROM word_bank');
    const existing = new Set(existingRows.map((r) => r.word));

    // Gather words from JSON that AREN'T in the DB yet.
    const toInsert: { word: string; length: number }[] = [];
    for (const [lengthStr, words] of Object.entries(data)) {
        const length = Number(lengthStr);
        for (const word of words) {
            const upper = word.toUpperCase();
            if (!existing.has(upper)) {
                toInsert.push({ word: upper, length });
            }
        }
    }

    if (toInsert.length === 0) {
        logger.info(
            { existing: existing.size },
            'Word bank already up to date'
        );
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Insert in batches of 500 to keep the parameterized query small.
        for (let i = 0; i < toInsert.length; i += 500) {
            const batch = toInsert.slice(i, i + 500);
            const values = batch
                .map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`)
                .join(',');
            const params = batch.flatMap((row) => [row.word, row.length]);
            await client.query(
                `INSERT INTO word_bank(word, length) VALUES ${values}
                 ON CONFLICT (word) DO NOTHING`,
                params
            );
        }
        await client.query('COMMIT');
        const total = await query<{ count: string }>(
            'SELECT COUNT(*)::text AS count FROM word_bank'
        );
        logger.info(
            { added: toInsert.length, total: total[0]?.count },
            'Word bank updated'
        );
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function main() {
    logger.info('Starting migrations…');
    await ensureMigrationsTable();
    const applied = await appliedMigrations();

    const files = (await readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith('.sql'))
        .sort();

    for (const f of files) {
        if (applied.has(f)) {
            logger.debug({ migration: f }, 'Already applied, skipping');
            continue;
        }
        const sql = await readFile(join(MIGRATIONS_DIR, f), 'utf8');
        await applyMigration(f, sql);
    }

    await seedWordBank();
    logger.info('Migrations complete');
    await pool.end();
    process.exit(0);
}

main().catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
});
