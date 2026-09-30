// Admin data access + moderation actions. Everything the admin panel needs:
// aggregate metrics, player search/detail, ban/unban/delete, coin/rank
// adjustments, reports, IAP/economy, and an audit trail of admin actions.
//
// Bots (auth_subject LIKE 'bot-%') are excluded from "real player" counts and
// from leaderboards, but ARE visible/filterable in the player list so an admin
// can inspect them.

import type { Document, Filter } from 'mongodb';
import { col, newId, registerIndexes, todayStr } from '../db/mongo.js';
import { redis } from '../db/redis.js';
import { bumpTokenVersion, deleteAccount } from './userService.js';
import { grantCoins } from './coinsService.js';
import { tierFromPoints } from '../game/ranks.js';

const BOT_RE = /^bot-/;
const IS_BOT: Filter<Document> = { auth_subject: BOT_RE };
const NOT_BOT: Filter<Document> = { auth_subject: { $not: BOT_RE } };
const NO_ID = { projection: { _id: 0 } } as const;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

registerIndexes('users', [
    { key: { id: 1 }, unique: true },
    { key: { rank_points: -1 } },
    { key: { created_at: -1 } },
    { key: { last_play_date: -1 } },
]);
registerIndexes('admin_audit_log', [
    { key: { id: 1 }, unique: true },
    { key: { created_at: -1 } },
    { key: { target_type: 1, target_id: 1, created_at: -1 } },
]);
registerIndexes('content_reports', [
    { key: { id: 1 }, unique: true },
    { key: { status: 1, created_at: -1 } },
    { key: { reporter_id: 1, created_at: -1 } },
    { key: { target_type: 1, target_id: 1, created_at: -1 } },
]);
registerIndexes('matches', [
    { key: { player1_id: 1, ended_at: -1 } },
    { key: { player2_id: 1, ended_at: -1 } },
    { key: { ended_at: -1 } },
]);
registerIndexes('iap_transactions', [
    { key: { user_id: 1, created_at: -1 } },
    { key: { store_verified: 1, created_at: -1 } },
]);
registerIndexes('coin_grants', [{ key: { user_id: 1, created_at: -1 } }, { key: { source: 1 } }]);
registerIndexes('ad_rewards', [{ key: { granted: 1, granted_at: -1 } }]);
registerIndexes('battle_pass_claims', [{ key: { user_id: 1, claimed_at: -1 } }]);
registerIndexes('hint_uses', [{ key: { user_id: 1 } }]);
registerIndexes('user_cosmetics', [{ key: { user_id: 1, acquired_at: -1 } }]);

// ─── Admin bootstrap / role ──────────────────────────────────────────────────

export async function isAdmin(userId: string): Promise<boolean> {
    const u = await col('users').findOne({ id: userId }, { projection: { is_admin: 1 } });
    return u?.is_admin ?? false;
}

/** Promote the configured admin emails at boot (idempotent). */
export async function promoteAdminEmails(emails: string[]): Promise<number> {
    if (emails.length === 0) return 0;
    const res = await col('users').updateMany(
        {
            email: { $in: emails.map((e) => new RegExp(`^${escapeRe(e)}$`, 'i')) },
            $or: [{ is_admin: false }, { is_super_admin: false }],
        },
        { $set: { is_admin: true, is_super_admin: true } }
    );
    return res.modifiedCount;
}

export async function setAdmin(userId: string, value: boolean): Promise<void> {
    await col('users').updateOne({ id: userId }, { $set: { is_admin: value, updated_at: new Date() } });
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export async function logAdminAction(args: {
    adminId: string;
    adminName: string;
    action: string;
    targetType?: string;
    targetId?: string;
    detail?: Record<string, unknown>;
}): Promise<void> {
    await col('admin_audit_log').insertOne({
        id: newId(),
        admin_id: args.adminId,
        admin_name: args.adminName,
        action: args.action,
        target_type: args.targetType ?? null,
        target_id: args.targetId ?? null,
        detail: args.detail ?? {},
        created_at: new Date(),
    });
}

export async function listAudit(limit = 100): Promise<unknown[]> {
    return col('admin_audit_log')
        .find({}, NO_ID)
        .sort({ created_at: -1 })
        .limit(Math.min(limit, 500))
        .toArray();
}

// ─── Dashboard overview ──────────────────────────────────────────────────────

export async function getOverview(): Promise<Record<string, unknown>> {
    const users = col('users');
    const now = new Date();
    const [
        total_players, bots, banned, admins, new_today, new_7d, dau, wau, [coinAgg], premium,
        mTotal, mToday, mD7, txns, openReports, season,
    ] = await Promise.all([
        users.countDocuments(NOT_BOT),
        users.countDocuments(IS_BOT),
        users.countDocuments({ banned: true }),
        users.countDocuments({ is_admin: true }),
        users.countDocuments({ ...NOT_BOT, created_at: { $gte: daysAgo(1) } }),
        users.countDocuments({ ...NOT_BOT, created_at: { $gte: daysAgo(7) } }),
        users.countDocuments({ ...NOT_BOT, last_play_date: { $gte: todayStr() } }),
        users.countDocuments({ ...NOT_BOT, last_play_date: { $gte: todayStr(daysAgo(7)) } }),
        users.aggregate([{ $match: NOT_BOT }, { $group: { _id: null, total: { $sum: '$coins' } } }]).toArray(),
        users.countDocuments({ ...NOT_BOT, battle_pass_premium: true }),
        col('matches').countDocuments({}),
        col('matches').countDocuments({ ended_at: { $gte: daysAgo(1) } }),
        col('matches').countDocuments({ ended_at: { $gte: daysAgo(7) } }),
        col('iap_transactions').countDocuments({}),
        col('content_reports').countDocuments({ status: 'open' }),
        col('battle_pass_seasons').findOne(
            { starts_at: { $lte: now }, ends_at: { $gte: now } },
            { projection: { season_number: 1, name: 1 }, sort: { season_number: -1 } }
        ),
    ]);

    let online = 0;
    try {
        online = await redis.hlen('presence:u2s');
    } catch {
        /* best effort */
    }

    return {
        players: { total: total_players, bots, banned, admins, premium, newToday: new_today, new7d: new_7d, dau, wau, onlineNow: online },
        matches: { total: mTotal, today: mToday, last7d: mD7 },
        economy: { totalCoins: coinAgg?.total ?? 0, iapTransactions: txns },
        moderation: { openReports },
        season: season ? { number: season.season_number, name: season.name } : null,
    };
}

// ─── Player list (search / sort / paginate) ─────────────────────────────────

const SORTABLE: Record<string, string> = {
    created_at: 'created_at',
    username: '_username_lower',
    rank_points: 'rank_points',
    wins: 'wins',
    losses: 'losses',
    coins: 'coins',
    play_streak: 'play_streak',
    best_streak: 'play_streak_best',
    last_play_date: 'last_play_date',
};

export async function listPlayers(args: {
    search?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
    filter?: 'all' | 'players' | 'bots' | 'banned' | 'admins' | 'premium';
}): Promise<{ rows: unknown[]; total: number; page: number; limit: number }> {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const page = Math.max(args.page ?? 1, 1);
    const offset = (page - 1) * limit;
    const sortCol = SORTABLE[args.sort ?? 'rank_points'] ?? 'rank_points';
    const order = args.order === 'asc' ? 1 : -1;

    const and: Filter<Document>[] = [];
    if (args.search) {
        const re = { $regex: escapeRe(args.search), $options: 'i' };
        and.push({ $or: [{ username: re }, { email: re }, { id: args.search }] });
    }
    switch (args.filter) {
        case 'players': and.push(NOT_BOT); break;
        case 'bots': and.push(IS_BOT); break;
        case 'banned': and.push({ banned: true }); break;
        case 'admins': and.push({ is_admin: true }); break;
        case 'premium': and.push({ battle_pass_premium: true }); break;
        default: break;
    }
    const match: Filter<Document> = and.length ? { $and: and } : {};

    const total = await col('users').countDocuments(match);
    // rank() over the filtered set, like the SQL window function.
    // ponytail: nulls sort first on ASC here (SQL had NULLS LAST); only last_play_date is nullable.
    const docs = await col('users')
        .aggregate([
            { $match: match },
            { $setWindowFields: { sortBy: { rank_points: -1 }, output: { rank_position: { $rank: {} } } } },
            { $addFields: { _username_lower: { $toLower: '$username' } } },
            { $sort: { [sortCol]: order, id: 1 } },
            { $skip: offset },
            { $limit: limit },
        ])
        .toArray();
    const rows = docs.map((u) => {
        const games = (u.wins ?? 0) + (u.losses ?? 0);
        return {
            id: u.id, username: u.username, email: u.email ?? null, auth_provider: u.auth_provider,
            is_bot: BOT_RE.test(u.auth_subject ?? ''), is_admin: u.is_admin ?? false, banned: u.banned ?? false,
            rank_points: u.rank_points, rank_tier: u.rank_tier, wins: u.wins, losses: u.losses,
            win_pct: games > 0 ? Math.round((1000 * u.wins) / games) / 10 : 0,
            play_streak: u.play_streak, play_streak_best: u.play_streak_best, last_play_date: u.last_play_date ?? null,
            coins: u.coins, premium: u.battle_pass_premium ?? false, created_at: u.created_at,
            rank_position: u.rank_position,
        };
    });
    return { rows, total, page, limit };
}

// ─── Player detail ───────────────────────────────────────────────────────────

async function usernamesById(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const want = [...new Set(ids.filter((x): x is string => !!x))];
    if (!want.length) return new Map();
    const rows = await col('users').find({ id: { $in: want } }, { projection: { id: 1, username: 1 } }).toArray();
    return new Map(rows.map((r) => [r.id as string, r.username as string]));
}

export async function getPlayerDetail(userId: string): Promise<Record<string, unknown> | null> {
    const u = await col('users').findOne({ id: userId }, NO_ID);
    if (!u) return null;
    const users = col('users');
    const [above, totalPlayers, lowerStreak] = await Promise.all([
        users.countDocuments({ ...NOT_BOT, rank_points: { $gt: u.rank_points } }),
        users.countDocuments(NOT_BOT),
        users.countDocuments({ ...NOT_BOT, play_streak_best: { $lt: u.play_streak_best } }),
    ]);
    u.is_bot = BOT_RE.test(u.auth_subject ?? '');
    u.rank_position = above + 1;
    u.total_players = totalPlayers;
    u.streak_percentile = totalPlayers ? lowerStreak / totalPlayers : null;
    delete u.password_hash;
    delete u.apple_refresh_token;
    delete u.auth_subject;

    const [matchDocs, coinLedger, cosmetics, iap, reportsAgainst, reportsBy, bpClaims, hintCount] =
        await Promise.all([
            col('matches').find({ $or: [{ player1_id: userId }, { player2_id: userId }] }).sort({ ended_at: -1 }).limit(25).toArray(),
            col('coin_grants').find({ user_id: userId }, { projection: { _id: 0, amount: 1, source: 1, metadata: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(30).toArray(),
            col('user_cosmetics').find({ user_id: userId }, { projection: { _id: 0, cosmetic_id: 1, acquired_via: 1, acquired_at: 1 } }).sort({ acquired_at: -1 }).toArray(),
            col('iap_transactions').find({ user_id: userId }, { projection: { _id: 0, platform: 1, product_id: 1, entitlement: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray(),
            col('content_reports').find({ target_type: 'user', target_id: userId }, { projection: { _id: 0, id: 1, reason: 1, detail: 1, status: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray(),
            col('content_reports').find({ reporter_id: userId }, { projection: { _id: 0, id: 1, target_type: 1, target_id: 1, reason: 1, status: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray(),
            col('battle_pass_claims').find({ user_id: userId }, { projection: { _id: 0, tier: 1, track: 1, claimed_at: 1 } }).sort({ claimed_at: -1 }).toArray(),
            col('hint_uses').countDocuments({ user_id: userId }),
        ]);
    const names = await usernamesById(matchDocs.flatMap((m) => [m.player1_id, m.player2_id]));
    const matches = matchDocs.map((m) => {
        const isP1 = m.player1_id === userId;
        return {
            id: m.id, word: m.word, outcome: m.outcome,
            is_win: m.winner_id == null ? null : m.winner_id === userId,
            rank_delta: isP1 ? m.p1_rank_delta : m.p2_rank_delta,
            opponent: names.get(isP1 ? m.player2_id : m.player1_id) ?? null,
            mode: m.mode, duration_seconds: m.duration_seconds, ended_at: m.ended_at,
        };
    });

    return {
        user: u,
        matches,
        coinLedger,
        cosmetics,
        iap,
        reportsAgainst,
        reportsBy,
        battlePassClaims: bpClaims,
        hintsUsed: hintCount,
    };
}

// ─── Moderation actions ──────────────────────────────────────────────────────

export async function banPlayer(userId: string, adminId: string, reason: string): Promise<void> {
    const now = new Date();
    await col('users').updateOne(
        { id: userId },
        { $set: { banned: true, banned_reason: reason || 'Violation of terms', banned_at: now, banned_by: adminId, updated_at: now } }
    );
    // Kick any live sessions immediately.
    await bumpTokenVersion(userId);
}

export async function unbanPlayer(userId: string): Promise<void> {
    await col('users').updateOne(
        { id: userId },
        { $set: { banned: false, banned_reason: null, banned_at: null, banned_by: null, updated_at: new Date() } }
    );
}

export async function deletePlayer(userId: string): Promise<void> {
    await deleteAccount(userId);
}

/** Adjust coins and/or rank points. Coins go through the audited ledger. */
export async function adjustPlayer(args: {
    userId: string;
    coinsDelta?: number;
    rankPoints?: number;
    reason?: string;
}): Promise<void> {
    if (args.coinsDelta && args.coinsDelta > 0) {
        await grantCoins({
            userId: args.userId,
            amount: args.coinsDelta,
            source: 'admin_grant',
            metadata: { reason: args.reason ?? 'admin adjust' },
        });
    } else if (args.coinsDelta && args.coinsDelta < 0) {
        // Negative adjust: clamp at zero and record the amount ACTUALLY removed
        // (not the requested delta) so the ledger reconciles with the balance.
        // The clamp happens inside one atomic pipeline update, so the ledger
        // entry always matches what was applied.
        const before = await col('users').findOneAndUpdate(
            { id: args.userId },
            [{ $set: { coins: { $max: [0, { $add: ['$coins', args.coinsDelta] }] }, updated_at: '$$NOW' } }],
            { returnDocument: 'before', projection: { coins: 1 } }
        );
        const cur = before?.coins ?? 0;
        const applied = -Math.min(cur, -args.coinsDelta); // ≤ 0, clamped
        await col('coin_grants').insertOne({
            id: newId(),
            user_id: args.userId,
            amount: applied,
            source: 'admin_grant',
            metadata: { reason: args.reason ?? 'admin adjust', requested: args.coinsDelta },
            created_at: new Date(),
        });
    }
    if (typeof args.rankPoints === 'number') {
        const pts = Math.max(0, Math.floor(args.rankPoints));
        await col('users').updateOne(
            { id: args.userId },
            { $set: { rank_points: pts, rank_tier: tierFromPoints(pts), updated_at: new Date() } }
        );
    }
}

// ─── Reports / matches / IAP / economy ──────────────────────────────────────

export async function listReports(status?: string): Promise<unknown[]> {
    const filter = status && status !== 'all' ? { status } : {};
    const reports = await col('content_reports').find(filter, NO_ID).sort({ created_at: -1 }).limit(200).toArray();
    const names = await usernamesById(reports.flatMap((r) => [r.reporter_id, r.target_type === 'user' ? r.target_id : null]));
    return reports.map((r) => ({
        id: r.id, target_type: r.target_type, target_id: r.target_id, reason: r.reason, detail: r.detail,
        status: r.status, created_at: r.created_at,
        reporter_name: names.get(r.reporter_id) ?? null,
        reporter_id: names.has(r.reporter_id) ? r.reporter_id : null,
        target_name: r.target_type === 'user' ? names.get(r.target_id) ?? null : null,
    }));
}

export async function setReportStatus(id: string, status: string): Promise<void> {
    await col('content_reports').updateOne({ id }, { $set: { status } });
}

export async function listRecentMatches(limit = 50, userId?: string): Promise<unknown[]> {
    const filter = userId ? { $or: [{ player1_id: userId }, { player2_id: userId }] } : {};
    const docs = await col('matches').find(filter).sort({ ended_at: -1 }).limit(Math.min(limit, 200)).toArray();
    const names = await usernamesById(docs.flatMap((m) => [m.player1_id, m.player2_id, m.winner_id]));
    return docs.map((m) => ({
        id: m.id, p1: names.get(m.player1_id) ?? null, p2: names.get(m.player2_id) ?? null,
        word: m.word, outcome: m.outcome, winner: m.winner_id ? names.get(m.winner_id) ?? null : null,
        mode: m.mode, p1_is_bot: m.p1_is_bot, p2_is_bot: m.p2_is_bot,
        duration_seconds: m.duration_seconds, ended_at: m.ended_at,
    }));
}

export async function listIap(limit = 100): Promise<unknown[]> {
    const docs = await col('iap_transactions').find({}).sort({ created_at: -1 }).limit(Math.min(limit, 500)).toArray();
    const names = await usernamesById(docs.map((t) => t.user_id));
    return docs.map((t) => ({
        id: t.id, platform: t.platform, product_id: t.product_id, entitlement: t.entitlement,
        transaction_id: t.transaction_id, store_verified: t.store_verified,
        username: names.get(t.user_id) ?? null, user_id: names.has(t.user_id) ? t.user_id : null,
        created_at: t.created_at,
    }));
}

export async function getEconomy(): Promise<unknown> {
    const pos = { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] };
    const neg = { $cond: [{ $lt: ['$amount', 0] }, { $subtract: [0, '$amount'] }, 0] };
    const since = daysAgo(30);
    const [bySource, [totalsAgg], [circ], [purchases], products, [engagement]] = await Promise.all([
        col('coin_grants').aggregate([
            { $group: { _id: '$source', granted: { $sum: pos }, spent: { $sum: neg }, events: { $sum: 1 } } },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, source: '$_id', granted: 1, spent: 1, events: 1 } },
        ]).toArray(),
        col('coin_grants').aggregate([{ $group: { _id: null, granted: { $sum: pos }, spent: { $sum: neg } } }]).toArray(),
        col('users').aggregate([{ $match: NOT_BOT }, { $group: { _id: null, circulating: { $sum: '$coins' } } }]).toArray(),
        col('iap_transactions').aggregate([
            { $match: { store_verified: true, created_at: { $gte: since } } },
            { $group: { _id: null, transactions: { $sum: 1 }, buyers: { $addToSet: '$user_id' } } },
            { $project: { _id: 0, transactions: 1, buyers: { $size: '$buyers' } } },
        ]).toArray(),
        col('iap_transactions').aggregate([
            { $match: { store_verified: true, created_at: { $gte: since } } },
            { $group: { _id: '$product_id', transactions: { $sum: 1 }, buyers: { $addToSet: '$user_id' } } },
            { $project: { _id: 0, product_id: '$_id', transactions: 1, buyers: { $size: '$buyers' } } },
            { $sort: { transactions: -1 } },
        ]).toArray(),
        col('ad_rewards').aggregate([
            { $match: { granted: true, transaction_id: { $not: /^dev-/ }, granted_at: { $gte: since } } },
            { $group: { _id: null, rewarded_ads: { $sum: 1 }, ad_viewers: { $addToSet: '$user_id' } } },
            { $project: { _id: 0, rewarded_ads: 1, ad_viewers: { $size: '$ad_viewers' } } },
        ]).toArray(),
    ]);
    const totals = { granted: totalsAgg?.granted ?? 0, spent: totalsAgg?.spent ?? 0, circulating: circ?.circulating ?? 0 };
    return {
        bySource,
        totals,
        monetization: {
            transactions: purchases?.transactions ?? 0, buyers: purchases?.buyers ?? 0,
            rewarded_ads: engagement?.rewarded_ads ?? 0, ad_viewers: engagement?.ad_viewers ?? 0,
            products,
        },
    };
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
    const u = await col('users').findOne({ id: userId }, { projection: { is_super_admin: 1 } });
    return u?.is_super_admin ?? false;
}

/** Support adjustments and their audit record. */
export async function supportPlayer(userId: string, actorId: string, actorName: string, body: {
    reason: string; cosmeticId?: string; adsRemoved?: boolean; hintCredits?: number;
    reveal?: number; scramble?: number; lock?: number; streakShields?: number;
    premium?: boolean;
}): Promise<void> {
    // ponytail: no multi-doc transaction; steps run sequentially (see db/mongo.ts).
    const found = await col('users').findOne({ id: userId }, { projection: { id: 1 } });
    if (!found) throw new Error('Player not found');
    const fields = { adsRemoved: 'ads_removed', hintCredits: 'hint_credits', reveal: 'powerup_reveal', scramble: 'powerup_scramble', lock: 'powerup_lock', streakShields: 'streak_shields' } as const;
    const set: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(fields)) {
        const value = body[key as keyof typeof fields];
        if (value !== undefined) set[field] = value;
    }
    if (body.premium === false) set.battle_pass_premium = false;
    if (Object.keys(set).length) {
        await col('users').updateOne({ id: userId }, { $set: { ...set, updated_at: new Date() } });
    }
    if (body.cosmeticId) {
        const { grantCosmetic } = await import('./cosmeticsService.js');
        await grantCosmetic(userId, body.cosmeticId, 'grant');
    }
    if (body.premium === true) {
        const { unlockPremium } = await import('./battlePassService.js');
        await unlockPremium(userId);
    }
    await col('admin_audit_log').insertOne({
        id: newId(), admin_id: actorId, admin_name: actorName, action: 'support',
        target_type: 'user', target_id: userId, detail: body, created_at: new Date(),
    });
}
