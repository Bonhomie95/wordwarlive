import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

describe.skipIf(!process.env.DATABASE_URL)('admin authorization and purchase HTTP flows', () => {
    let server: Server;
    let origin: string;
    let pool: typeof import('../../src/db/pool.js').pool;
    let redis: typeof import('../../src/db/redis.js').redis;
    const users: { id: string; token: string }[] = [];
    const txnPrefix = `qa-http-${randomUUID()}`;
    beforeAll(async () => {
        ({ pool } = await import('../../src/db/pool.js'));
        ({ redis } = await import('../../src/db/redis.js'));
        const { createUser } = await import('../../src/services/userService.js');
        const { signSession } = await import('../../src/auth/jwt.js');
        for (let i = 0; i < 3; i++) {
            const u = await createUser({ username: `qh_${randomUUID().slice(0, 8)}`, provider: 'anonymous', subject: randomUUID() });
            users.push({ id: u.id, token: signSession({ userId: u.id, username: u.username, provider: 'anonymous', tokenVersion: u.token_version }) });
        }
        await pool.query('UPDATE users SET is_admin = true, is_super_admin = true WHERE id = $1', [users[0].id]);
        await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [users[1].id]);
        const app = express();
        app.use(express.json());
        app.use('/api', (await import('../../src/routes/admin.js')).adminRouter);
        app.use('/api', (await import('../../src/routes/coins.js')).coinsRouter);
        app.use('/api', (await import('../../src/routes/cosmetics.js')).cosmeticsRouter);
        app.use('/api', (await import('../../src/routes/battlepass.js')).battlePassRouter);
        app.use('/api', (await import('../../src/routes/ads.js')).adsRouter);
        server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server.on('listening', resolve));
        origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    });
    afterAll(async () => {
        if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
        if (pool) {
            await pool.query('DELETE FROM admin_audit_log WHERE admin_id = ANY($1::uuid[])', [users.map((u) => u.id)]);
            await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users.map((u) => u.id)]);
            await pool.query('DELETE FROM iap_transactions WHERE transaction_id LIKE $1', [`${txnPrefix}%`]);
            await pool.end();
        }
        if (redis) redis.disconnect();
    });
    async function req(index: number, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
        return fetch(origin + path, { method, headers: { authorization: `Bearer ${users[index].token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    }

    it('rejects normal players, restricts role management, and protects super-admins', async () => {
        expect((await req(2, '/admin/overview')).status).toBe(403);
        expect((await req(1, `/admin/players/${users[2].id}/role`, { admin: true })).status).toBe(403);
        expect((await req(1, `/admin/players/${users[0].id}/ban`, {})).status).toBe(403);
        expect((await req(0, `/admin/players/${users[0].id}`, undefined, 'DELETE')).status).toBe(403);
        expect((await req(0, '/admin/players/invalid')).status).toBe(400);
        const self = await (await req(0, '/admin/me')).json();
        expect(self.superAdmin).toBe(true);
    });

    it('restores entitlements with an audit reason and excludes account secrets', async () => {
        const path = `/admin/players/${users[2].id}/support`;
        expect((await req(0, path, { hintCredits: 5 })).status).toBe(400);
        const result = await req(0, path, { hintCredits: 5, reveal: 3, adsRemoved: true, cosmeticId: 'border_legend', reason: 'QA missing item recovery' });
        expect(result.status).toBe(200);
        const detail = await (await req(0, `/admin/players/${users[2].id}`)).json();
        expect(detail.user.hint_credits).toBe(5);
        expect(detail.user.powerup_reveal).toBe(3);
        expect(detail.user.ads_removed).toBe(true);
        expect(detail.user).not.toHaveProperty('password_hash');
        expect(detail.user).not.toHaveProperty('apple_refresh_token');
        expect(detail.cosmetics.some((c: { cosmetic_id: string }) => c.cosmetic_id === 'border_legend')).toBe(true);
        expect((await pool.query("SELECT 1 FROM admin_audit_log WHERE target_id = $1 AND action = 'support'", [users[2].id])).rowCount).toBe(1);
    });

    it('coin packs and starter bundle grant once across retries and concurrent transactions', async () => {
        const payload = { platform: 'ios', transactionId: `${txnPrefix}-coins` };
        const buys = await Promise.all(Array.from({ length: 5 }, () => req(2, '/coins/packs/pebble/purchase', payload)));
        expect(buys.every((r) => r.status === 200)).toBe(true);
        const bundles = await Promise.all(Array.from({ length: 3 }, (_, i) => req(2, '/coins/bundles/starter/purchase', { platform: 'ios', transactionId: `${txnPrefix}-bundle-${i}` })));
        expect(bundles.every((r) => r.status === 200)).toBe(true);
        expect((await pool.query('SELECT coins FROM users WHERE id = $1', [users[2].id])).rows[0].coins).toBe(600);
        expect((await req(2, '/coins/bundles/starter/purchase', { platform: 'ios', transactionId: `${txnPrefix}-bundle-0` })).status).toBe(200);
        expect((await req(1, '/coins/packs/pebble/purchase', payload)).status).toBe(409);
    });

    it('premium, remove ads, cosmetic purchases and equip eligibility persist', async () => {
        for (const [path, suffix] of [['/battlepass/upgrade-premium', 'premium'], ['/ads/remove-ads-purchase', 'ads'], ['/cosmetics/theme_obsidian/purchase', 'theme']]) {
            const payload = { platform: 'ios', transactionId: `${txnPrefix}-${suffix}` };
            expect((await req(2, path, payload)).status).toBe(200);
            expect((await req(2, path, payload)).status).toBe(200);
        }
        const u = (await pool.query('SELECT ads_removed, battle_pass_premium FROM users WHERE id = $1', [users[2].id])).rows[0];
        expect(u).toEqual({ ads_removed: true, battle_pass_premium: true });
        const { updateEquippedCosmetic } = await import('../../src/services/userService.js');
        await updateEquippedCosmetic(users[2].id, 'board_theme', 'theme_obsidian');
        expect((await pool.query('SELECT equipped_board_theme FROM users WHERE id = $1', [users[2].id])).rows[0].equipped_board_theme).toBe('theme_obsidian');
    });

    it('moderates real UUID reports and records the action', async () => {
        const report = await pool.query("INSERT INTO content_reports (reporter_id, target_type, target_id, reason) VALUES ($1, 'user', $2, 'cheating') RETURNING id", [users[2].id, users[1].id]);
        expect((await req(0, `/admin/reports/${report.rows[0].id}/status`, { status: 'actioned' })).status).toBe(200);
        expect((await pool.query('SELECT status FROM content_reports WHERE id = $1', [report.rows[0].id])).rows[0].status).toBe('actioned');
    });

    it('ban invalidates existing sessions immediately and unban requires a new session', async () => {
        expect((await req(0, `/admin/players/${users[2].id}/ban`, { reason: 'QA moderation' })).status).toBe(200);
        expect((await req(2, '/cosmetics')).status).toBe(403);
        expect((await req(0, `/admin/players/${users[2].id}/unban`, {})).status).toBe(200);
        expect((await req(2, '/cosmetics')).status).toBe(401);
    });
});
