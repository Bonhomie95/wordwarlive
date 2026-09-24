// Admin API — everything the Vite admin panel consumes. Every route except
// /admin/login is gated by requireAuth + requireAdmin, and every mutation is
// recorded to admin_audit_log.
//
//   POST   /api/admin/login                 email+password, MUST be an admin
//   GET    /api/admin/me                     verify the admin session
//   GET    /api/admin/overview               dashboard KPIs
//   GET    /api/admin/players                search / sort / paginate
//   GET    /api/admin/players/:id            full player dossier
//   POST   /api/admin/players/:id/ban        { reason }
//   POST   /api/admin/players/:id/unban
//   POST   /api/admin/players/:id/adjust     { coins?, rankPoints?, reason? }
//   POST   /api/admin/players/:id/role       { admin: boolean }
//   DELETE /api/admin/players/:id            hard delete (GDPR)
//   GET    /api/admin/reports                ?status=open|reviewed|all
//   POST   /api/admin/reports/:id/status     { status }
//   GET    /api/admin/matches                ?limit=&userId=
//   GET    /api/admin/iap                    recent purchases
//   GET    /api/admin/economy                coin sources / sinks
//   GET    /api/admin/leaderboard            ?limit=
//   GET    /api/admin/audit                  admin action log

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { findUserByEmail, getPasswordHash } from '../services/userService.js';
import { verifyPassword } from '../auth/password.js';
import { signSession } from '../auth/jwt.js';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import * as admin from '../services/adminService.js';

export const adminRouter = Router();

// ─── Login (public, but only admins pass) ────────────────────────────────────

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

adminRouter.post('/admin/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const { email, password } = parsed.data;

    // Auto-promote configured bootstrap emails at login time too, so the very
    // first admin login works without a server restart.
    if (env.adminEmails.includes(email.toLowerCase())) {
        await admin.promoteAdminEmails([email.toLowerCase()]);
    }

    const user = await findUserByEmail(email);
    if (!user || user.auth_provider !== 'email') {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const hash = await getPasswordHash(user.id);
    if (!hash || !(await verifyPassword(password, hash))) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!(await admin.isAdmin(user.id))) {
        return res.status(403).json({ error: 'This account is not an administrator.' });
    }
    const token = signSession({
        userId: user.id,
        username: user.username,
        tokenVersion: user.token_version,
        provider: 'email',
    });
    res.json({ token, admin: { id: user.id, username: user.username, email: user.email } });
});

// ─── Everything below requires an admin session ──────────────────────────────

adminRouter.use('/admin', requireAuth, requireAdmin);

const wrap =
    (fn: (req: import('express').Request, res: import('express').Response) => Promise<unknown>) =>
    (req: import('express').Request, res: import('express').Response) => {
        fn(req, res).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('admin route error', err);
            if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
        });
    };

// Attach the acting admin's identity for the audit log.
async function actor(req: import('express').Request) {
    return { id: req.session!.userId, name: req.session!.username };
}

adminRouter.get('/admin/me', wrap(async (req, res) => {
    res.json({ id: req.session!.userId, username: req.session!.username });
}));

adminRouter.get('/admin/overview', wrap(async (_req, res) => {
    res.json(await admin.getOverview());
}));

// ─── Players ─────────────────────────────────────────────────────────────────

const listQuery = z.object({
    search: z.string().max(128).optional(),
    sort: z.string().max(32).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    filter: z.enum(['all', 'players', 'bots', 'banned', 'admins', 'premium']).optional(),
});

adminRouter.get('/admin/players', wrap(async (req, res) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'Invalid query' });
    res.json(await admin.listPlayers(q.data));
}));

adminRouter.get('/admin/players/:id', wrap(async (req, res) => {
    const detail = await admin.getPlayerDetail(String(req.params.id));
    if (!detail) return res.status(404).json({ error: 'Player not found' });
    res.json(detail);
}));

const banSchema = z.object({ reason: z.string().max(500).optional() });

adminRouter.post('/admin/players/:id/ban', wrap(async (req, res) => {
    const id = String(req.params.id);
    const parsed = banSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const { reason } = parsed.data;
    const a = await actor(req);
    if (id === a.id) return res.status(400).json({ error: "You can't ban yourself." });
    await admin.banPlayer(id, a.id, reason ?? '');
    await admin.logAdminAction({ adminId: a.id, adminName: a.name, action: 'ban', targetType: 'user', targetId: id, detail: { reason } });
    res.json({ ok: true });
}));

adminRouter.post('/admin/players/:id/unban', wrap(async (req, res) => {
    const id = String(req.params.id);
    const a = await actor(req);
    await admin.unbanPlayer(id);
    await admin.logAdminAction({ adminId: a.id, adminName: a.name, action: 'unban', targetType: 'user', targetId: id });
    res.json({ ok: true });
}));

const adjustSchema = z.object({
    coinsDelta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    rankPoints: z.number().int().min(0).max(1_000_000).optional(),
    reason: z.string().max(500).optional(),
});

adminRouter.post('/admin/players/:id/adjust', wrap(async (req, res) => {
    const id = String(req.params.id);
    const parsed = adjustSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const body = parsed.data;
    const a = await actor(req);
    await admin.adjustPlayer({ userId: id, ...body });
    await admin.logAdminAction({ adminId: a.id, adminName: a.name, action: 'adjust', targetType: 'user', targetId: id, detail: body });
    res.json({ ok: true });
}));

const roleSchema = z.object({ admin: z.boolean() });

adminRouter.post('/admin/players/:id/role', wrap(async (req, res) => {
    const id = String(req.params.id);
    const parsed = roleSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const { admin: makeAdmin } = parsed.data;
    const a = await actor(req);
    if (id === a.id && !makeAdmin) {
        return res.status(400).json({ error: "You can't remove your own admin access." });
    }
    await admin.setAdmin(id, makeAdmin);
    await admin.logAdminAction({ adminId: a.id, adminName: a.name, action: makeAdmin ? 'promote' : 'demote', targetType: 'user', targetId: id });
    res.json({ ok: true });
}));

adminRouter.delete('/admin/players/:id', wrap(async (req, res) => {
    const id = String(req.params.id);
    const a = await actor(req);
    if (id === a.id) return res.status(400).json({ error: "You can't delete your own account here." });
    // Snapshot a little identity before the row is gone, for the audit trail.
    const who = await query<{ username: string; email: string | null }>(
        'SELECT username, email FROM users WHERE id = $1',
        [id]
    );
    await admin.deletePlayer(id);
    await admin.logAdminAction({ adminId: a.id, adminName: a.name, action: 'delete', targetType: 'user', targetId: id, detail: { username: who[0]?.username, email: who[0]?.email } });
    res.json({ ok: true });
}));

// ─── Reports ─────────────────────────────────────────────────────────────────

adminRouter.get('/admin/reports', wrap(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await admin.listReports(status));
}));

const statusSchema = z.object({ status: z.enum(['open', 'reviewed', 'actioned', 'dismissed']) });

adminRouter.post('/admin/reports/:id/status', wrap(async (req, res) => {
    const id = String(req.params.id);
    const parsed = statusSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid status' });
    const { status } = parsed.data;
    const a = await actor(req);
    await admin.setReportStatus(id, status);
    await admin.logAdminAction({ adminId: a.id, adminName: a.name, action: 'report_status', targetType: 'report', targetId: id, detail: { status } });
    res.json({ ok: true });
}));

// ─── Matches / IAP / economy / leaderboard / audit ──────────────────────────

adminRouter.get('/admin/matches', wrap(async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    res.json(await admin.listRecentMatches(limit, userId));
}));

adminRouter.get('/admin/iap', wrap(async (req, res) => {
    res.json(await admin.listIap(Number(req.query.limit) || 100));
}));

adminRouter.get('/admin/economy', wrap(async (_req, res) => {
    res.json(await admin.getEconomy());
}));

adminRouter.get('/admin/leaderboard', wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await query(
        `SELECT rank() OVER (ORDER BY rank_points DESC) AS position,
                id, username, rank_points, rank_tier, wins, losses, play_streak, play_streak_best
         FROM users WHERE NOT (auth_subject LIKE 'bot-%')
         ORDER BY rank_points DESC LIMIT $1`,
        [limit]
    );
    res.json(rows);
}));

adminRouter.get('/admin/audit', wrap(async (req, res) => {
    res.json(await admin.listAudit(Number(req.query.limit) || 100));
}));
