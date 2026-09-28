import { z } from 'zod';
import { query, transaction } from '../db/pool.js';
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
    const [versions, control, activity] = await Promise.all([
        query(
            "SELECT * FROM synthetic_config_versions WHERE effective_day <= (now() AT TIME ZONE 'UTC')::date+1 ORDER BY id DESC LIMIT 20",
        ),
        query<{ paused: boolean }>('SELECT paused FROM synthetic_control WHERE id=1'),
        query<{ n: string }>(
            "SELECT count(*)::text n FROM users WHERE auth_subject NOT LIKE 'bot-%' AND NOT banned AND last_play_date >= (now() AT TIME ZONE 'UTC')::date - 1",
        ),
    ]);
    return {
        defaults,
        versions,
        paused: control[0]?.paused ?? false,
        realPlayers: Number(activity[0]?.n ?? 0),
        effectiveDay: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    };
}
export async function ensureSyntheticDay(day: string): Promise<Day> {
    return transaction(async (client) => {
        // Serialize materialization and pause so no concurrent request publishes future activity.
        await client.query('SELECT id FROM synthetic_control WHERE id=1 FOR UPDATE');
        await client.query(
            `INSERT INTO synthetic_identities(player_index,identity) SELECT (value->>'index')::int,value FROM jsonb_array_elements($1::jsonb) ON CONFLICT DO NOTHING`,
            [JSON.stringify(population())],
        );
        const existing = await client.query<{ payload: Day }>(
            'SELECT payload FROM synthetic_days WHERE day=$1',
            [day],
        );
        if (existing.rows[0]) return existing.rows[0].payload;
        const versions = await client.query<{ id: number; settings: Settings }>(
            'SELECT id,settings FROM synthetic_config_versions WHERE effective_day <= $1 ORDER BY id DESC LIMIT 1',
            [day],
        );
        const version = versions.rows[0];
        const today = new Date().toISOString().slice(0, 10);
        const real = await client.query<{ n: string }>(
            "SELECT count(*)::text n FROM users WHERE auth_subject NOT LIKE 'bot-%' AND NOT banned AND last_play_date >= $1::date - 1 AND last_play_date <= $1::date",
            [day],
        );
        const count = version ? Number(real.rows[0]?.n ?? 0) : 0;
        const payload = version
            ? tuneDay(day, version.settings, count)
            : { ranked: rankedActivity(day), daily: syntheticSolvers(day) };
        const identities = await client.query<{player_index:number;username:string}>("SELECT player_index,identity->>'username' username FROM synthetic_identities");
        const names = new Map(identities.rows.map(p => [p.player_index,p.username]));
        payload.daily = payload.daily.map(s => ({...s,username:names.get(Number(s.userId.split(':').at(-1))) ?? s.username}));
        const control = await client.query<{ paused: boolean }>(
            'SELECT paused FROM synthetic_control WHERE id=1',
        );
        if (control.rows[0]?.paused && day >= today) {
            payload.ranked = [];
            payload.daily = [];
        }
        await client.query(
            'INSERT INTO synthetic_days(day,version_id,payload,real_players) VALUES ($1,$2,$3,$4)',
            [day, version?.id ?? null, JSON.stringify(payload), count],
        );
        return payload;
    });
}
export async function updateSynthetic(
    settings: Settings | undefined,
    paused: boolean | undefined,
    actorId: string,
    actorName: string,
    reason: string,
) {
    // Freeze today's baseline before making changes. Pausing preserves all completed results.
    await ensureSyntheticDay(new Date().toISOString().slice(0, 10));
    return transaction(async (client) => {
        await client.query('SELECT id FROM synthetic_control WHERE id=1 FOR UPDATE');
        if (settings)
            await client.query(
                "INSERT INTO synthetic_config_versions(effective_day,settings,actor_id,reason) VALUES ((now() AT TIME ZONE 'UTC')::date+1,$1,$2,$3)",
                [JSON.stringify(settings), actorId, reason],
            );
        if (paused !== undefined) {
            await client.query('UPDATE synthetic_control SET paused=$1 WHERE id=1', [paused]);
            if (paused) {
                const rows = await client.query<{ day: Date; payload: Day }>(
                    "SELECT day,payload FROM synthetic_days WHERE day >= (now() AT TIME ZONE 'UTC')::date FOR UPDATE",
                );
                const cutoff = Date.now();
                for (const row of rows.rows)
                    await client.query('UPDATE synthetic_days SET payload=$1 WHERE day=$2', [
                        JSON.stringify(freezeCompletedActivity(row.payload, cutoff)),
                        row.day,
                    ]);
            }
        }
        await client.query(
            "INSERT INTO admin_audit_log(admin_id,admin_name,action,target_type,detail) VALUES($1,$2,'synthetic_config','system',$3)",
            [actorId, actorName, JSON.stringify({ settings, paused, reason })],
        );
    });
}
export async function persistedSyntheticLeaderboard(
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
    const stored = await query<{ day: string }>(
        'SELECT day::text FROM synthetic_days WHERE day BETWEEN $1 AND $2',
        [HISTORY_START, today],
    );
    const present = new Set(stored.map((r) => r.day));
    for (
        let d = new Date(HISTORY_START + 'T00:00:00Z');
        d.toISOString().slice(0, 10) <= today;
        d.setUTCDate(d.getUTCDate() + 1)
    ) {
        const day = d.toISOString().slice(0, 10);
        if (!present.has(day)) await ensureSyntheticDay(day);
    }
    const rows = await query<{ day: string; payload: Day }>(
        'SELECT day::text,payload FROM synthetic_days WHERE day BETWEEN $1 AND $2',
        [HISTORY_START, today],
    );
    const identities = await query<{ identity: SyntheticPlayer }>(
        'SELECT identity FROM synthetic_identities ORDER BY player_index',
    );
    const players = identities.map((r) => r.identity);
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
    const [control, versions, real] = await Promise.all([
        query<{ paused: boolean }>('SELECT paused FROM synthetic_control WHERE id=1'),
        query<{ settings: Settings }>(
            "SELECT settings FROM synthetic_config_versions WHERE effective_day <= (now() AT TIME ZONE 'UTC')::date ORDER BY id DESC LIMIT 1",
        ),
        query<{ n: string }>(
            "SELECT count(*)::text n FROM users WHERE auth_subject NOT LIKE 'bot-%' AND NOT banned AND last_play_date >= (now() AT TIME ZONE 'UTC')::date-1",
        ),
    ]);
    const settings = versions[0]?.settings ?? defaults;
    const ratio = Math.max(0, 1 - Number(real[0]?.n ?? 0) / settings.realPlayerTarget);
    return {
        allowed: !control[0]?.paused && settings.population > 0 && ratio > 0,
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
