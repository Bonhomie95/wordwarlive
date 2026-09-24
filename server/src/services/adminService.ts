// Admin data access + moderation actions. Everything the admin panel needs:
// aggregate metrics, player search/detail, ban/unban/delete, coin/rank
// adjustments, reports, IAP/economy, and an audit trail of admin actions.
//
// Bots (auth_subject LIKE 'bot-%') are excluded from "real player" counts and
// from leaderboards, but ARE visible/filterable in the player list so an admin
// can inspect them.

import { pool, query } from '../db/pool.js';
import { redis } from '../db/redis.js';
import { bumpTokenVersion, deleteAccount } from './userService.js';
import { grantCoins } from './coinsService.js';
import { tierFromPoints } from '../game/ranks.js';

const BOT_FILTER = "auth_subject LIKE 'bot-%'";

// ─── Admin bootstrap / role ──────────────────────────────────────────────────

export async function isAdmin(userId: string): Promise<boolean> {
    const rows = await query<{ is_admin: boolean }>(
        'SELECT is_admin FROM users WHERE id = $1',
        [userId]
    );
    return rows[0]?.is_admin ?? false;
}

/** Promote the configured admin emails at boot (idempotent). */
export async function promoteAdminEmails(emails: string[]): Promise<number> {
    if (emails.length === 0) return 0;
    const res = await pool.query(
        `UPDATE users SET is_admin = TRUE
         WHERE lower(email) = ANY($1::text[]) AND is_admin = FALSE`,
        [emails]
    );
    return res.rowCount ?? 0;
}

export async function setAdmin(userId: string, value: boolean): Promise<void> {
    await query('UPDATE users SET is_admin = $1, updated_at = now() WHERE id = $2', [value, userId]);
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
    await query(
        `INSERT INTO admin_audit_log (admin_id, admin_name, action, target_type, target_id, detail)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [args.adminId, args.adminName, args.action, args.targetType ?? null, args.targetId ?? null, args.detail ?? {}]
    );
}

export async function listAudit(limit = 100): Promise<unknown[]> {
    return query(
        `SELECT id, admin_id, admin_name, action, target_type, target_id, detail, created_at
         FROM admin_audit_log ORDER BY created_at DESC LIMIT $1`,
        [Math.min(limit, 500)]
    );
}

// ─── Dashboard overview ──────────────────────────────────────────────────────

export async function getOverview(): Promise<Record<string, unknown>> {
    const [agg] = await query<{
        total_players: string;
        bots: string;
        banned: string;
        admins: string;
        new_today: string;
        new_7d: string;
        dau: string;
        wau: string;
        total_coins: string;
        premium: string;
    }>(
        `SELECT
            COUNT(*) FILTER (WHERE NOT (${BOT_FILTER}))                                   AS total_players,
            COUNT(*) FILTER (WHERE ${BOT_FILTER})                                         AS bots,
            COUNT(*) FILTER (WHERE banned)                                                AS banned,
            COUNT(*) FILTER (WHERE is_admin)                                              AS admins,
            COUNT(*) FILTER (WHERE NOT (${BOT_FILTER}) AND created_at >= now()-interval '1 day')  AS new_today,
            COUNT(*) FILTER (WHERE NOT (${BOT_FILTER}) AND created_at >= now()-interval '7 day')  AS new_7d,
            COUNT(*) FILTER (WHERE NOT (${BOT_FILTER}) AND last_play_date >= (now() at time zone 'utc')::date)    AS dau,
            COUNT(*) FILTER (WHERE NOT (${BOT_FILTER}) AND last_play_date >= ((now() at time zone 'utc')::date - 7)) AS wau,
            COALESCE(SUM(coins) FILTER (WHERE NOT (${BOT_FILTER})),0)                     AS total_coins,
            COUNT(*) FILTER (WHERE battle_pass_premium AND NOT (${BOT_FILTER}))           AS premium
         FROM users`
    );

    const [matches] = await query<{ total: string; today: string; d7: string }>(
        `SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE ended_at >= now()-interval '1 day') AS today,
            COUNT(*) FILTER (WHERE ended_at >= now()-interval '7 day') AS d7
         FROM matches`
    );

    const [iap] = await query<{ txns: string }>(`SELECT COUNT(*) AS txns FROM iap_transactions`);
    const [reports] = await query<{ open: string }>(
        `SELECT COUNT(*) AS open FROM content_reports WHERE status = 'open'`
    );
    const [season] = await query<{ season_number: number; name: string }>(
        `SELECT season_number, name FROM battle_pass_seasons
         WHERE now() BETWEEN starts_at AND ends_at ORDER BY season_number DESC LIMIT 1`
    );

    let online = 0;
    try {
        online = await redis.hlen('presence:u2s');
    } catch {
        /* best effort */
    }

    const num = (v: string | undefined) => Number(v ?? 0);
    return {
        players: {
            total: num(agg?.total_players),
            bots: num(agg?.bots),
            banned: num(agg?.banned),
            admins: num(agg?.admins),
            premium: num(agg?.premium),
            newToday: num(agg?.new_today),
            new7d: num(agg?.new_7d),
            dau: num(agg?.dau),
            wau: num(agg?.wau),
            onlineNow: online,
        },
        matches: { total: num(matches?.total), today: num(matches?.today), last7d: num(matches?.d7) },
        economy: { totalCoins: num(agg?.total_coins), iapTransactions: num(iap?.txns) },
        moderation: { openReports: num(reports?.open) },
        season: season ? { number: season.season_number, name: season.name } : null,
    };
}

// ─── Player list (search / sort / paginate) ─────────────────────────────────

const SORTABLE: Record<string, string> = {
    created_at: 'created_at',
    username: 'lower(username)',
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
    const order = args.order === 'asc' ? 'ASC' : 'DESC';

    const where: string[] = [];
    const params: unknown[] = [];
    if (args.search) {
        params.push(`%${args.search}%`);
        params.push(args.search);
        where.push(`(username ILIKE $${params.length - 1} OR email ILIKE $${params.length - 1} OR id::text = $${params.length})`);
    }
    switch (args.filter) {
        case 'players': where.push(`NOT (${BOT_FILTER})`); break;
        case 'bots': where.push(BOT_FILTER); break;
        case 'banned': where.push('banned'); break;
        case 'admins': where.push('is_admin'); break;
        case 'premium': where.push('battle_pass_premium'); break;
        default: break;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = await query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM users ${whereSql}`,
        params
    );
    const total = Number(totalRow[0]?.n ?? 0);

    params.push(limit, offset);
    const rows = await query(
        `SELECT id, username, email, auth_provider,
                (${BOT_FILTER}) AS is_bot, is_admin, banned,
                rank_points, rank_tier, wins, losses,
                CASE WHEN wins+losses > 0 THEN round(100.0*wins/(wins+losses),1) ELSE 0 END AS win_pct,
                play_streak, play_streak_best, last_play_date,
                coins, battle_pass_premium AS premium, created_at,
                rank() OVER (ORDER BY rank_points DESC) AS rank_position
         FROM users ${whereSql}
         ORDER BY ${sortCol} ${order} NULLS LAST, id
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    return { rows, total, page, limit };
}

// ─── Player detail ───────────────────────────────────────────────────────────

export async function getPlayerDetail(userId: string): Promise<Record<string, unknown> | null> {
    const rows = await query<Record<string, unknown>>(
        `SELECT u.*, (${BOT_FILTER}) AS is_bot,
                (SELECT count(*) FROM users t WHERE t.rank_points > u.rank_points AND NOT (t.auth_subject LIKE 'bot-%')) + 1 AS rank_position,
                (SELECT count(*) FROM users WHERE NOT (auth_subject LIKE 'bot-%')) AS total_players,
                -- Fraction of real players with a lower best streak. A window
                -- function here would see only this one filtered row (→ always
                -- 0), so compute it with correlated subqueries instead.
                (SELECT count(*) FROM users t WHERE NOT (t.auth_subject LIKE 'bot-%') AND t.play_streak_best < u.play_streak_best)::float
                    / NULLIF((SELECT count(*) FROM users WHERE NOT (auth_subject LIKE 'bot-%')), 0) AS streak_percentile
         FROM users u WHERE u.id = $1`,
        [userId]
    );
    const u = rows[0];
    if (!u) return null;
    delete (u as Record<string, unknown>).password_hash;

    const [matches, coinLedger, cosmetics, iap, reportsAgainst, reportsBy, bpClaims, hintCount] =
        await Promise.all([
            query(
                `SELECT m.id, m.word, m.outcome, m.winner_id = $1 AS is_win,
                        CASE WHEN m.player1_id=$1 THEN m.p1_rank_delta ELSE m.p2_rank_delta END AS rank_delta,
                        CASE WHEN m.player1_id=$1 THEN u2.username ELSE u1.username END AS opponent,
                        m.mode, m.duration_seconds, m.ended_at
                 FROM matches m JOIN users u1 ON u1.id=m.player1_id JOIN users u2 ON u2.id=m.player2_id
                 WHERE m.player1_id=$1 OR m.player2_id=$1 ORDER BY m.ended_at DESC LIMIT 25`,
                [userId]
            ),
            query(`SELECT amount, source, metadata, created_at FROM coin_grants WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`, [userId]),
            query(`SELECT cosmetic_id, acquired_via, acquired_at FROM user_cosmetics WHERE user_id=$1 ORDER BY acquired_at DESC`, [userId]),
            query(`SELECT platform, product_id, entitlement, created_at FROM iap_transactions WHERE user_id=$1 ORDER BY created_at DESC`, [userId]),
            query(`SELECT id, reason, detail, status, created_at FROM content_reports WHERE target_type='user' AND target_id=$1 ORDER BY created_at DESC`, [userId]),
            query(`SELECT id, target_type, target_id, reason, status, created_at FROM content_reports WHERE reporter_id=$1 ORDER BY created_at DESC`, [userId]),
            query(`SELECT tier, track, claimed_at FROM battle_pass_claims WHERE user_id=$1 ORDER BY claimed_at DESC`, [userId]),
            query<{ n: string }>(`SELECT count(*) AS n FROM hint_uses WHERE user_id=$1`, [userId]),
        ]);

    return {
        user: u,
        matches,
        coinLedger,
        cosmetics,
        iap,
        reportsAgainst,
        reportsBy,
        battlePassClaims: bpClaims,
        hintsUsed: Number((hintCount[0] as { n?: string } | undefined)?.n ?? 0),
    };
}

// ─── Moderation actions ──────────────────────────────────────────────────────

export async function banPlayer(userId: string, adminId: string, reason: string): Promise<void> {
    await query(
        `UPDATE users SET banned=TRUE, banned_reason=$2, banned_at=now(), banned_by=$3, updated_at=now() WHERE id=$1`,
        [userId, reason || 'Violation of terms', adminId]
    );
    // Kick any live sessions immediately.
    await bumpTokenVersion(userId);
}

export async function unbanPlayer(userId: string): Promise<void> {
    await query(
        `UPDATE users SET banned=FALSE, banned_reason=NULL, banned_at=NULL, banned_by=NULL, updated_at=now() WHERE id=$1`,
        [userId]
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
        // Both statements run in one transaction so we never leave an unlogged
        // deduction (or a logged one that didn't apply).
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const before = await client.query<{ coins: number }>(
                'SELECT coins FROM users WHERE id = $1 FOR UPDATE',
                [args.userId]
            );
            const cur = before.rows[0]?.coins ?? 0;
            const applied = -Math.min(cur, -args.coinsDelta); // ≤ 0, clamped
            await client.query(
                'UPDATE users SET coins = coins + $1, updated_at=now() WHERE id=$2',
                [applied, args.userId]
            );
            await client.query(
                `INSERT INTO coin_grants (user_id, amount, source, metadata) VALUES ($1,$2,'admin_grant',$3)`,
                [args.userId, applied, { reason: args.reason ?? 'admin adjust', requested: args.coinsDelta }]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
    if (typeof args.rankPoints === 'number') {
        const pts = Math.max(0, Math.floor(args.rankPoints));
        await query(
            `UPDATE users SET rank_points=$1, rank_tier=$2, updated_at=now() WHERE id=$3`,
            [pts, tierFromPoints(pts), args.userId]
        );
    }
}

// ─── Reports / matches / IAP / economy ──────────────────────────────────────

export async function listReports(status?: string): Promise<unknown[]> {
    const where = status && status !== 'all' ? 'WHERE r.status = $1' : '';
    const params = where ? [status] : [];
    return query(
        `SELECT r.id, r.target_type, r.target_id, r.reason, r.detail, r.status, r.created_at,
                ru.username AS reporter_name, ru.id AS reporter_id,
                tu.username AS target_name
         FROM content_reports r
         LEFT JOIN users ru ON ru.id = r.reporter_id
         LEFT JOIN users tu ON r.target_type='user' AND tu.id::text = r.target_id
         ${where}
         ORDER BY r.created_at DESC LIMIT 200`,
        params
    );
}

export async function setReportStatus(id: string, status: string): Promise<void> {
    await query(`UPDATE content_reports SET status=$1 WHERE id=$2`, [status, id]);
}

export async function listRecentMatches(limit = 50, userId?: string): Promise<unknown[]> {
    const where = userId ? 'WHERE m.player1_id=$2 OR m.player2_id=$2' : '';
    const params: unknown[] = [Math.min(limit, 200)];
    if (userId) params.push(userId);
    return query(
        `SELECT m.id, u1.username AS p1, u2.username AS p2, m.word, m.outcome,
                uw.username AS winner, m.mode, m.p1_is_bot, m.p2_is_bot,
                m.duration_seconds, m.ended_at
         FROM matches m
         JOIN users u1 ON u1.id=m.player1_id JOIN users u2 ON u2.id=m.player2_id
         LEFT JOIN users uw ON uw.id=m.winner_id
         ${where}
         ORDER BY m.ended_at DESC LIMIT $1`,
        params
    );
}

export async function listIap(limit = 100): Promise<unknown[]> {
    return query(
        `SELECT t.id, t.platform, t.product_id, t.entitlement, t.transaction_id,
                u.username, u.id AS user_id, t.created_at
         FROM iap_transactions t LEFT JOIN users u ON u.id=t.user_id
         ORDER BY t.created_at DESC LIMIT $1`,
        [Math.min(limit, 500)]
    );
}

export async function getEconomy(): Promise<unknown> {
    const bySource = await query(
        `SELECT source,
                SUM(amount) FILTER (WHERE amount > 0) AS granted,
                -SUM(amount) FILTER (WHERE amount < 0) AS spent,
                COUNT(*) AS events
         FROM coin_grants GROUP BY source ORDER BY source`
    );
    const [totals] = await query<{ granted: string; spent: string; circulating: string }>(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE amount>0),0) AS granted,
                COALESCE(-SUM(amount) FILTER (WHERE amount<0),0) AS spent,
                (SELECT COALESCE(SUM(coins),0) FROM users WHERE NOT (${BOT_FILTER})) AS circulating
         FROM coin_grants`
    );
    return { bySource, totals };
}
