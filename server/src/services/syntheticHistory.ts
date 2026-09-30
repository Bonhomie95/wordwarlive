import { z } from 'zod';
import { col, newId, registerIndexes, todayStr } from '../db/mongo.js';
import {
    rankedActivity,
    population,
    HISTORY_START,
    compareStandings,
    type RankedActivity,
    type Period,
    type Mode,
    type SyntheticEntry,
    type SyntheticPlayer,
} from './syntheticPlayers.js';
import { syntheticSolvers, type SyntheticSolver } from './dailySynthetic.js';
import { tierFromPoints } from '../game/ranks.js';

registerIndexes('synthetic_config_versions', [{ key: { id: 1 }, unique: true }, { key: { effective_day: 1, created_at: -1 } }]);
registerIndexes('synthetic_days', [{ key: { day: 1 }, unique: true }]);
registerIndexes('synthetic_control', [{ key: { id: 1 }, unique: true }]);
registerIndexes('synthetic_identities', [{ key: { player_index: 1 }, unique: true }]);
registerIndexes('users', [{ key: { last_play_date: 1 } }]);
registerIndexes('admin_audit_log', [{ key: { id: 1 }, unique: true }, { key: { created_at: -1 } }]);

interface VersionDoc {
    id: string;
    effective_day: string;
    settings: Settings;
    created_at: Date;
    actor_id: string | null;
    reason: string;
}
interface DayDoc {
    day: string;
    version_id: string | null;
    algorithm_version: number;
    payload: Day;
    real_players: number;
    created_at: Date;
}
const versions = () => col<VersionDoc>('synthetic_config_versions');
const days = () => col<DayDoc>('synthetic_days');
const control = () => col<{ id: number; paused: boolean }>('synthetic_control');
const identities = () => col<{ player_index: number; identity: SyntheticPlayer }>('synthetic_identities');
/** Real humans who played on `day` or the day before (`last_play_date` is a YYYY-MM-DD string). */
function countRealPlayers(day: string, upTo?: string): Promise<number> {
    const prev = todayStr(new Date(Date.parse(day + 'T00:00:00Z') - 86400000));
    return col('users').countDocuments({
        auth_subject: { $not: /^bot-/ },
        banned: false,
        last_play_date: upTo ? { $gte: prev, $lte: upTo } : { $gte: prev },
    });
}
const isPaused = async () => (await control().findOne({ id: 1 }))?.paused ?? false;
export const settingsSchema = z
    .object({
        population: z.number().int().min(0).max(2500),
        dailyMin: z.number().int().min(15).max(240),
        dailyMax: z.number().int().min(15).max(240),
        rankedMin: z.number().int().min(30).max(360),
        rankedMax: z.number().int().min(30).max(360),
        dailyCap: z.number().int().min(1).max(9),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        realPlayerTarget: z.number().int().min(10).max(100000),
    })
    .refine(
        (s) => s.dailyMin <= s.dailyMax && s.rankedMin <= s.rankedMax,
        'Minimum interval must not exceed maximum',
    );
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = {
    population: 2500,
    dailyMin: 30,
    dailyMax: 60,
    rankedMin: 60,
    rankedMax: 240,
    dailyCap: 9,
    difficulty: 'medium',
    realPlayerTarget: 500,
};
export type Day = { ranked: RankedActivity[]; daily: SyntheticSolver[] };
export function tuneDay(day: string, settings: Settings, realPlayers: number): Day {
    const start = Date.parse(day + 'T00:00:00Z');
    const ratio = Math.max(0, 1 - realPlayers / settings.realPlayerTarget);
    const limit = Math.floor(settings.population * ratio);
    // Map original waves onto configured intervals while preserving per-match spacing.
    const transform = (
        times: number[],
        min: number,
        max: number,
        oldMin: number,
        oldMax: number,
    ) => {
        const result = new Map<number, number>();
        let previous = start,
            next = start;
        for (const at of [...new Set(times)].sort((a, b) => a - b)) {
            next +=
                (min + (((at - previous) / 60000 - oldMin) / (oldMax - oldMin)) * (max - min)) *
                60000;
            result.set(at, Math.round(next));
            previous = at;
        }
        return result;
    };
    const raw = rankedActivity(day);
    const waves = transform(
        raw.map((e) => e.waveStartedAtMs),
        settings.rankedMin,
        settings.rankedMax,
        60,
        240,
    );
    const counts = new Map<number, number>();
    const ranked = raw
        .filter((e) => e.playerIndex < limit)
        .map((e) => ({
            ...e,
            atMs: waves.get(e.waveStartedAtMs)! + e.atMs - e.waveStartedAtMs,
            waveStartedAtMs: waves.get(e.waveStartedAtMs)!,
        }))
        .filter((e) => {
            const count = counts.get(e.playerIndex) ?? 0;
            counts.set(e.playerIndex, count + 1);
            return count < settings.dailyCap && e.atMs < start + 86400000;
        });
    const solvers = syntheticSolvers(day);
    const arrivals = transform(
        solvers.map((e) => e.solvedAtMs),
        settings.dailyMin,
        settings.dailyMax,
        30,
        60,
    );
    const daily = solvers
        .filter((e) => Number(e.userId.split(':').at(-1)) < limit)
        .map((e) => ({
            ...e,
            guessCount: Math.max(
                2,
                Math.min(
                    7,
                    e.guessCount +
                        (settings.difficulty === 'easy'
                            ? 1
                            : settings.difficulty === 'hard'
                              ? -1
                              : 0),
                ),
            ),
            solvedAtMs: arrivals.get(e.solvedAtMs)!,
        }))
        .filter((e) => e.solvedAtMs < start + 86400000 && e.solvedAtMs >= start + e.durationMs);
    return { ranked, daily };
}
export async function getSyntheticSettings() {
    const tomorrow = todayStr(new Date(Date.now() + 86400000));
    const [versionRows, paused, realPlayers] = await Promise.all([
        versions().find({ effective_day: { $lte: tomorrow } }, { projection: { _id: 0 }, sort: { created_at: -1 }, limit: 20 }).toArray(),
        isPaused(),
        countRealPlayers(todayStr()),
    ]);
    return {
        defaults,
        versions: versionRows,
        paused,
        realPlayers,
        effectiveDay: tomorrow,
    };
}
// The identity population is fixed for the life of the deployment, so seed it
// and read it back once per process instead of on every day materialization
// (the all-time backfill touches ~60 days on a cold database).
let identityPromise: Promise<SyntheticPlayer[]> | null = null;
function loadIdentities(): Promise<SyntheticPlayer[]> {
    identityPromise ??= (async () => {
        await identities().bulkWrite(
            population().map((p) => ({
                updateOne: {
                    filter: { player_index: p.index },
                    update: { $setOnInsert: { player_index: p.index, identity: p } },
                    upsert: true,
                },
            })),
            { ordered: false },
        );
        const stored = await identities().find({}, { projection: { _id: 0, identity: 1 }, sort: { player_index: 1 } }).toArray();
        return stored.map((r) => r.identity);
    })().catch((err) => {
        identityPromise = null;
        throw err;
    });
    return identityPromise;
}

export async function ensureSyntheticDay(day: string): Promise<Day> {
    // ponytail: no cross-document lock. A racing materialization of the same day
    // loses on the unique `day` index and reads back the winner's payload.
    const players = await loadIdentities();
    const existing = await days().findOne({ day }, { projection: { _id: 0, payload: 1 } });
    if (existing) return existing.payload;
    const version = await versions().findOne(
        { effective_day: { $lte: day } },
        { projection: { _id: 0, id: 1, settings: 1 }, sort: { created_at: -1 } },
    );
    const today = todayStr();
    const count = version ? await countRealPlayers(day, day) : 0;
    const payload = version
        ? tuneDay(day, version.settings, count)
        : { ranked: rankedActivity(day), daily: syntheticSolvers(day) };
    const names = new Map(players.map((p) => [p.index, p.username]));
    payload.daily = payload.daily.map((s) => ({ ...s, username: names.get(Number(s.userId.split(':').at(-1))) ?? s.username }));
    if ((await isPaused()) && day >= today) {
        payload.ranked = [];
        payload.daily = [];
    }
    const written = await days().updateOne(
        { day },
        { $setOnInsert: { day, version_id: version?.id ?? null, algorithm_version: 3, payload, real_players: count, created_at: new Date() } },
        { upsert: true },
    );
    if (written.upsertedCount) return payload;
    return (await days().findOne({ day }, { projection: { _id: 0, payload: 1 } }))!.payload;
}
export async function updateSynthetic(
    settings: Settings | undefined,
    paused: boolean | undefined,
    actorId: string,
    actorName: string,
    reason: string,
) {
    // Freeze today's baseline before making changes. Pausing preserves all completed results.
    const today = todayStr();
    await ensureSyntheticDay(today);
    if (settings)
        await versions().insertOne({
            id: newId(),
            effective_day: todayStr(new Date(Date.now() + 86400000)),
            settings,
            created_at: new Date(),
            actor_id: actorId,
            reason,
        });
    if (paused !== undefined) {
        await control().updateOne({ id: 1 }, { $set: { paused } }, { upsert: true });
        if (paused) {
            const rows = await days().find({ day: { $gte: today } }, { projection: { _id: 0, day: 1, payload: 1 } }).toArray();
            const cutoff = Date.now();
            for (const row of rows)
                await days().updateOne({ day: row.day }, { $set: { payload: freezeCompletedActivity(row.payload, cutoff) } });
        }
    }
    await col('admin_audit_log').insertOne({
        id: newId(),
        admin_id: actorId,
        admin_name: actorName,
        action: 'synthetic_config',
        target_type: 'system',
        target_id: null,
        detail: { settings, paused, reason },
        created_at: new Date(),
    });
}
// Share simultaneous reads without retaining results after completion. An admin
// pause or a newly completed activity is therefore visible on the next read.
const pendingBoards = new Map<string, Promise<SyntheticEntry[]>>();
export async function persistedSyntheticLeaderboard(
    period: Period,
    mode: Mode,
    now = Date.now(),
): Promise<SyntheticEntry[]> {
    const minute = Math.floor(now / 60000) * 60000;
    const key = `${period}:${mode}:${minute}`;
    const pending = pendingBoards.get(key);
    if (pending) return pending;
    const result = readSyntheticLeaderboard(period, mode, minute);
    pendingBoards.set(key, result);
    try { return await result; }
    finally { pendingBoards.delete(key); }
}

async function readSyntheticLeaderboard(
    period: Period,
    mode: Mode,
    now = Date.now(),
): Promise<SyntheticEntry[]> {
    const today = new Date(now).toISOString().slice(0, 10);
    const start = new Date(today + 'T00:00:00Z');
    if (period === 'weekly') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    if (period === 'monthly') start.setUTCDate(1);
    const from = period === 'all_time' ? HISTORY_START : start.toISOString().slice(0, 10);
    // Backfill once, preserving the existing baseline before future configuration changes.
    const range = { day: { $gte: HISTORY_START, $lte: today } };
    const stored = await days().find(range, { projection: { _id: 0, day: 1 } }).toArray();
    const present = new Set(stored.map((r) => r.day));
    const missing: string[] = [];
    for (
        let d = new Date(HISTORY_START + 'T00:00:00Z');
        d.toISOString().slice(0, 10) <= today;
        d.setUTCDate(d.getUTCDate() + 1)
    ) {
        const day = d.toISOString().slice(0, 10);
        if (!present.has(day)) missing.push(day);
    }
    // Materialize missing days concurrently; each one is a handful of round trips.
    for (let i = 0; i < missing.length; i += 15) {
        await Promise.all(missing.slice(i, i + 15).map((day) => ensureSyntheticDay(day)));
    }
    const rows = await days().find(range, { projection: { _id: 0, day: 1, payload: 1 } }).toArray();
    const players = await loadIdentities();
    const totals = players.map(() => ({ wins: 0, losses: 0, net: 0 }));
    const cutoff = Math.floor(now / 60000) * 60000;
    for (const row of rows)
        for (const e of row.payload.ranked) {
            if (e.atMs > cutoff) continue;
            const t = totals[e.playerIndex]!;
            t.net += e.win ? 1 : -1;
            if (
                row.day < from ||
                (mode === 'classic' && e.mystery) ||
                (mode === 'mystery' && !e.mystery)
            )
                continue;
            if (e.win) t.wins++;
            else t.losses++;
        }
    return players
        .flatMap((p, i) => {
            const t = totals[i]!;
            if (!t.wins && !t.losses) return [];
            const rankPoints = Math.max(0, p.basePoints + 6 * t.net);
            return [
                {
                    userId: p.userId,
                    username: p.username,
                    wins: t.wins,
                    losses: t.losses,
                    rankPoints,
                    rankTier: tierFromPoints(rankPoints),
                },
            ];
        })
        .sort(compareStandings);
}
export async function persistedDailySolvers(day: string, now = Date.now()) {
    return (await ensureSyntheticDay(day)).daily.filter((e) => e.solvedAtMs <= now);
}

/** Queue fallbacks consult the same operator controls; running matches finish normally. */
export async function syntheticMatchPolicy() {
    const today = todayStr();
    const [paused, version, real] = await Promise.all([
        isPaused(),
        versions().findOne({ effective_day: { $lte: today } }, { projection: { _id: 0, settings: 1 }, sort: { created_at: -1 } }),
        countRealPlayers(today),
    ]);
    const settings = version?.settings ?? defaults;
    const ratio = Math.max(0, 1 - real / settings.realPlayerTarget);
    return {
        allowed: !paused && settings.population > 0 && ratio > 0,
        waitMultiplier: 1 + 3 * (1 - ratio),
        rankOffset:
            settings.difficulty === 'easy' ? -300 : settings.difficulty === 'hard' ? 300 : 0,
    };
}

export function freezeCompletedActivity(payload: Day, now: number): Day {
    const rankedCutoff = Math.floor(now / 60000) * 60000;
    return {
        ranked: payload.ranked.filter((e) => e.atMs <= rankedCutoff),
        daily: payload.daily.filter((e) => e.solvedAtMs <= now),
    };
}
