// Idempotent seed: indexes, the word bank from src/data/words.json, and the
// static content rows that used to live in migrations/010, 017, 027, 029.
// Every write is an upsert keyed on the row's primary key, so re-running is
// a no-op on an already-seeded database.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnyBulkWriteOperation } from 'mongodb';
import { col, ensureIndexes, newId, registerIndexes, todayStr } from './mongo.js';
import { logger } from '../utils/logger.js';
import { normalizeWordBank } from '../game/wordBankSeed.js';

const WORDS_PATH = join(dirname(fileURLToPath(import.meta.url)), '../data/words.json');
const DAY_MS = 86_400_000;

// Primary keys of the seeded content tables (services may register these
// too; createIndexes is idempotent for identical specs).
registerIndexes('battle_pass_seasons', [{ key: { season_number: 1 }, unique: true }]);
registerIndexes('battle_pass_rewards', [{ key: { season_number: 1, tier: 1, track: 1 }, unique: true }]);
registerIndexes('cosmetics', [{ key: { id: 1 }, unique: true }]);
registerIndexes('rank_seasons', [{ key: { id: 1 }, unique: true }]);
registerIndexes('synthetic_control', [{ key: { id: 1 }, unique: true }]);
registerIndexes('synthetic_config_versions', [{ key: { id: 1 }, unique: true }, { key: { effective_day: 1 } }]);
registerIndexes('inventory_history', [{ key: { id: 1 }, unique: true }, { key: { user_id: 1, created_at: -1 } }]);

/** ON CONFLICT DO NOTHING for a batch of rows sharing the same key fields. */
async function upsertMany<T extends Record<string, unknown>>(collection: string, keys: (keyof T & string)[], rows: T[]): Promise<void> {
    if (rows.length === 0) return;
    const ops: AnyBulkWriteOperation[] = rows.map((row) => ({
        updateOne: {
            filter: Object.fromEntries(keys.map((k) => [k, row[k]])),
            update: { $setOnInsert: row },
            upsert: true,
        },
    }));
    await col(collection).bulkWrite(ops, { ordered: false });
}

async function seedWordBank(): Promise<void> {
    const data = JSON.parse(await readFile(WORDS_PATH, 'utf8')) as Record<string, string[]>;
    const words = normalizeWordBank(data);
    const existing = new Set(
        (await col<{ word: string }>('word_bank').find({}, { projection: { _id: 0, word: 1 } }).toArray()).map((r) => r.word)
    );
    const toInsert = words.filter(({ word }) => !existing.has(word));
    if (toInsert.length === 0) {
        logger.info({ existing: existing.size }, 'Word bank already up to date');
        return;
    }
    // Same fields the old migrate.ts wrote: word, length (+ the SQL default difficulty=3).
    for (let i = 0; i < toInsert.length; i += 500) {
        await upsertMany('word_bank', ['word'], toInsert.slice(i, i + 500).map((w) => ({ ...w, difficulty: 3 })));
    }
    logger.info({ added: toInsert.length, total: await col('word_bank').countDocuments() }, 'Word bank updated');
}

const D = (s: string) => new Date(s);
const CREATED = D('2026-05-09T06:39:03.162Z');
const cosmetic = (id: string, category: string, name: string, description: string, price_cents: number, rarity: string, render_data: Record<string, unknown>, available_in_shop = true) =>
    ({ id, category, name, description, price_cents, rarity, render_data, available_in_shop, created_at: CREATED });

async function seedContent(): Promise<void> {
    const now = Date.now();

    // 010_seed_content.sql + 017_season_two.sql
    await upsertMany('battle_pass_seasons', ['season_number'], [
        { season_number: 1, name: 'Season One: First Words', starts_at: D('2026-05-02T06:39:03.168Z'), ends_at: D('2026-07-31T06:39:03.168Z'), xp_per_tier: 100, max_tier: 50 },
        // Dated relative to first seed time so the pass is active out of the box (90-day window).
        { season_number: 2, name: 'Season Two: Sharper Words', starts_at: new Date(now - DAY_MS), ends_at: new Date(now + 90 * DAY_MS), xp_per_tier: 100, max_tier: 50 },
    ]);

    await upsertMany('cosmetics', ['id'], [
        cosmetic('theme_classic', 'board_theme', 'Classic', 'The default WordWar board.', 0, 'common', { bg: '#0F1115', wrong: '#3A3D44', correct: '#3DDC97', misplaced: '#F4B940' }),
        cosmetic('theme_neon', 'board_theme', 'Neon Pulse', 'Saturated neon, dark mood.', 299, 'rare', { bg: '#08080F', wrong: '#1B1B2A', correct: '#00FF9C', misplaced: '#FF4FCB' }),
        cosmetic('theme_paper', 'board_theme', 'Paperback', 'Warm cream, ink-pressed letters.', 299, 'rare', { bg: '#F4ECDB', wrong: '#9C8C73', correct: '#5C7A2B', misplaced: '#C58A2E' }),
        cosmetic('theme_obsidian', 'board_theme', 'Obsidian', 'Pitch-black with gold highlights.', 499, 'epic', { bg: '#000000', wrong: '#1A1A1A', correct: '#D4AF37', misplaced: '#F1A33C' }),
        cosmetic('victory_pulse', 'victory_anim', 'Pulse', 'A clean radial pulse.', 0, 'common', { kind: 'pulse', color: '#3DDC97' }),
        cosmetic('victory_confetti', 'victory_anim', 'Confetti Storm', 'Particles for days.', 399, 'rare', { kind: 'confetti', palette: ['#3DDC97', '#F4B940', '#FF4FCB'] }),
        cosmetic('victory_lightning', 'victory_anim', 'Lightning', 'Strikes from the corners.', 799, 'epic', { kind: 'lightning' }),
        cosmetic('avatar_default', 'avatar', 'Default', 'A simple circle.', 0, 'common', { color: '#6B7280', shape: 'circle' }),
        cosmetic('avatar_fox_01', 'avatar', 'Fox', 'Stylized fox.', 199, 'common', { asset: 'fox_01' }),
        cosmetic('avatar_owl_01', 'avatar', 'Owl', 'Wide-eyed and ready.', 199, 'common', { asset: 'owl_01' }),
        cosmetic('nameplate_plain', 'nameplate', 'Plain', 'No effects.', 0, 'common', { effect: 'none' }),
        cosmetic('nameplate_gold', 'nameplate', 'Gold', 'Solid gold name.', 299, 'rare', { color: '#D4AF37', effect: 'solid' }),
        cosmetic('nameplate_rainbow', 'nameplate', 'Spectrum', 'Animated rainbow shimmer.', 599, 'epic', { effect: 'gradient_shimmer' }),
        cosmetic('border_bronze', 'profile_border', 'Bronze Frame', 'Earned: hit Bronze.', 0, 'common', { color: '#A97142' }, false),
        cosmetic('border_diamond', 'profile_border', 'Diamond Frame', 'Earned: hit Diamond.', 0, 'epic', { color: '#7CC8FF' }, false),
        cosmetic('border_legend', 'profile_border', 'Legend Frame', 'Top 500 of a season.', 0, 'legendary', { glow: true, color: '#FFD700' }, false),
    ]);

    const rewards: [number, number, 'free' | 'premium', string][] = [
        [1, 5, 'free', 'theme_paper'], [1, 10, 'free', 'avatar_fox_01'], [1, 15, 'free', 'victory_pulse'],
        [1, 25, 'free', 'nameplate_plain'], [1, 50, 'free', 'theme_neon'],
        [1, 1, 'premium', 'theme_obsidian'], [1, 5, 'premium', 'avatar_owl_01'], [1, 10, 'premium', 'nameplate_gold'],
        [1, 20, 'premium', 'victory_confetti'], [1, 30, 'premium', 'victory_lightning'],
        [1, 40, 'premium', 'nameplate_rainbow'], [1, 50, 'premium', 'border_legend'],
        [2, 5, 'free', 'theme_paper'], [2, 12, 'free', 'avatar_fox_01'], [2, 20, 'free', 'victory_confetti'],
        [2, 35, 'free', 'theme_neon'], [2, 50, 'free', 'border_diamond'],
        [2, 1, 'premium', 'theme_obsidian'], [2, 6, 'premium', 'avatar_owl_01'], [2, 10, 'premium', 'nameplate_gold'],
        [2, 18, 'premium', 'victory_lightning'], [2, 30, 'premium', 'nameplate_rainbow'], [2, 45, 'premium', 'border_legend'],
    ];
    await upsertMany('battle_pass_rewards', ['season_number', 'tier', 'track'],
        rewards.map(([season_number, tier, track, cosmetic_id]) => ({ season_number, tier, track, cosmetic_id })));

    await upsertMany('rank_seasons', ['id'], [
        { id: 1, name: 'Season 1', starts_at: D('2026-05-15T17:15:13.841Z'), ends_at: D('2026-07-10T17:15:13.841Z'), soft_reset_delta: 200, created_at: D('2026-05-15T17:15:13.841Z') },
    ]);

    // 027_live_operations.sql
    await upsertMany('synthetic_control', ['id'], [{ id: 1, paused: false }]);
    // The serial id is not stable across databases, so the initial defaults
    // row is keyed on its reason instead.
    await upsertMany('synthetic_config_versions', ['reason'], [{
        id: newId(),
        effective_day: todayStr(new Date(now + DAY_MS)),
        settings: { population: 2500, dailyMin: 30, dailyMax: 60, rankedMin: 60, rankedMax: 240, dailyCap: 9, difficulty: 'medium', realPlayerTarget: 500 },
        created_at: new Date(now),
        actor_id: null,
        reason: 'Initial live operations defaults',
    }]);
    // 029_inventory_history.sql only created a table + trigger; the trigger
    // (users inventory diff audit) has no Mongo equivalent and is not seeded.
}

export async function seed(): Promise<void> {
    logger.info('Seeding…');
    await ensureIndexes();
    await seedWordBank();
    await seedContent();
    logger.info('Seed complete');
}
