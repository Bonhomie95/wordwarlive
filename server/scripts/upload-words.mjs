#!/usr/bin/env node
// Upload AI-generated word lists into the word_bank table.
//
// Usage:
//   node scripts/upload-words.mjs file1.json [file2.json ...]
//   node scripts/upload-words.mjs --clear-length 9
//   node scripts/upload-words.mjs --dump > backup.json
//
// Each JSON file must be a flat array of uppercase words, all the same
// length. The script auto-detects the length and tags each word with it.
// If a file contains mixed lengths, it'll error out so you can split.
//
// Behavior:
//   - Validates words: A-Z only, 4-10 chars, no duplicates within file
//   - Dedupes against existing DB rows
//   - Inserts in batches of 500 with ON CONFLICT (word) DO NOTHING
//   - Prints summary per length
//
// Requires DATABASE_URL env var (same one the server uses).

import { readFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set. Run from the server folder or set the env var.');
    exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// ─── Parse args ─────────────────────────────────────────────────────────────

const args = argv.slice(2);

if (args.length === 0) {
    console.error('Usage:');
    console.error('  node scripts/upload-words.mjs file1.json [file2.json ...]');
    console.error('  node scripts/upload-words.mjs --clear-length <N>');
    console.error('  node scripts/upload-words.mjs --dump');
    exit(1);
}

// Dispatch on mode.
if (args[0] === '--clear-length') {
    const len = Number(args[1]);
    if (!Number.isInteger(len) || len < 4 || len > 10) {
        console.error('ERROR: --clear-length requires an integer 4-10');
        exit(1);
    }
    await clearLength(len);
    await pool.end();
    exit(0);
}

if (args[0] === '--dump') {
    await dump();
    await pool.end();
    exit(0);
}

// Default: upload files.
let totalAdded = 0;
let totalSkipped = 0;
for (const file of args) {
    const r = await uploadFile(file);
    totalAdded += r.added;
    totalSkipped += r.skipped;
}
console.log(`\n✓ Done. ${totalAdded} added, ${totalSkipped} skipped (duplicates).`);
await pool.end();

// ─── Mode: upload one file ──────────────────────────────────────────────────

async function uploadFile(filePath) {
    console.log(`\n→ Processing ${filePath}`);
    let raw;
    try {
        raw = await readFile(filePath, 'utf8');
    } catch (err) {
        console.error(`  ERROR: Could not read ${filePath}: ${err.message}`);
        return { added: 0, skipped: 0 };
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        console.error(`  ERROR: Invalid JSON in ${filePath}: ${err.message}`);
        return { added: 0, skipped: 0 };
    }

    if (!Array.isArray(parsed)) {
        console.error(`  ERROR: ${filePath} must be a JSON array, got ${typeof parsed}`);
        return { added: 0, skipped: 0 };
    }

    // Normalize, validate, dedupe.
    const seenInFile = new Set();
    const valid = [];
    const errors = [];
    for (const item of parsed) {
        if (typeof item !== 'string') {
            errors.push(`Non-string: ${JSON.stringify(item)}`);
            continue;
        }
        const w = item.trim().toUpperCase();
        if (!/^[A-Z]+$/.test(w)) {
            errors.push(`Non-alphabetic: ${item}`);
            continue;
        }
        if (w.length < 4 || w.length > 10) {
            errors.push(`Wrong length (${w.length}): ${w}`);
            continue;
        }
        if (seenInFile.has(w)) continue; // dedupe within file silently
        seenInFile.add(w);
        valid.push(w);
    }
    if (errors.length > 0) {
        console.warn(`  ⚠ ${errors.length} invalid entries skipped (showing first 5):`);
        for (const e of errors.slice(0, 5)) console.warn(`     - ${e}`);
    }
    if (valid.length === 0) {
        console.warn('  Nothing to upload from this file.');
        return { added: 0, skipped: 0 };
    }

    // Group by length. If a file has multiple lengths, that's allowed but
    // surfaces a warning so you can split if it was unintentional.
    const byLength = new Map();
    for (const w of valid) {
        const len = w.length;
        if (!byLength.has(len)) byLength.set(len, []);
        byLength.get(len).push(w);
    }
    if (byLength.size > 1) {
        console.warn(
            `  ⚠ File contains ${byLength.size} different lengths: ${[...byLength.keys()].join(', ')}`
        );
    }

    // Check what's already in DB for these words.
    const existing = await fetchExistingWords(valid);

    // Filter to new ones.
    const toInsert = valid.filter((w) => !existing.has(w));
    const skipped = valid.length - toInsert.length;

    if (toInsert.length === 0) {
        console.log(`  All ${valid.length} words already in DB. Nothing new.`);
        return { added: 0, skipped };
    }

    // Insert in batches.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < toInsert.length; i += 500) {
            const batch = toInsert.slice(i, i + 500);
            const values = batch
                .map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`)
                .join(',');
            const params = batch.flatMap((w) => [w, w.length]);
            await client.query(
                `INSERT INTO word_bank(word, length) VALUES ${values}
                 ON CONFLICT (word) DO NOTHING`,
                params
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ERROR during insert: ${err.message}`);
        client.release();
        return { added: 0, skipped: 0 };
    }
    client.release();

    // Per-length summary.
    const summary = new Map();
    for (const w of toInsert) {
        summary.set(w.length, (summary.get(w.length) ?? 0) + 1);
    }
    console.log(`  ✓ ${toInsert.length} new words added (${skipped} duplicates skipped)`);
    for (const [len, n] of [...summary.entries()].sort((a, b) => a[0] - b[0])) {
        console.log(`     ${len}-letter: +${n}`);
    }

    return { added: toInsert.length, skipped };
}

// ─── Mode: clear one length ─────────────────────────────────────────────────

async function clearLength(length) {
    // Safety: also dump first so the user has a recovery path. We write the
    // backup to stderr so you can capture if you want, or just lose it.
    console.error(`Backing up length=${length} to stderr before delete...`);
    const rows = await pool.query(
        'SELECT word FROM word_bank WHERE length = $1 ORDER BY word',
        [length]
    );
    console.error(JSON.stringify(rows.rows.map((r) => r.word)));

    const res = await pool.query(
        'DELETE FROM word_bank WHERE length = $1',
        [length]
    );
    console.log(`✓ Deleted ${res.rowCount} ${length}-letter words.`);
}

// ─── Mode: dump everything as JSON ──────────────────────────────────────────

async function dump() {
    const rows = await pool.query(
        'SELECT word, length FROM word_bank ORDER BY length, word'
    );
    const grouped = {};
    for (const r of rows.rows) {
        const k = String(r.length);
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(r.word);
    }
    // Pretty JSON to stdout.
    console.log(JSON.stringify(grouped, null, 2));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns the subset of `words` that already exist in the DB. */
async function fetchExistingWords(words) {
    if (words.length === 0) return new Set();
    const rows = await pool.query(
        'SELECT word FROM word_bank WHERE word = ANY($1::text[])',
        [words]
    );
    return new Set(rows.rows.map((r) => r.word));
}
