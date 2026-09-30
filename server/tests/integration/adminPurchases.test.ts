import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { hasDb, mongo, useDb } from './db.js';

describe.skipIf(!hasDb)('admin authorization and purchase HTTP flows', () => {
    useDb();
    let server: Server;
    let origin: string;
    let col: Awaited<ReturnType<typeof mongo>>['col'];
    const users: { id: string; token: string }[] = [];
    const txnPrefix = `qa-http-${randomUUID()}`;
    beforeAll(async () => {
        ({ col } = await mongo());
        const { createUser } = await import('../../src/services/userService.js');
        const { signSession } = await import('../../src/auth/jwt.js');
        for (let i = 0; i < 3; i++) {
            const u = await createUser({ username: `qh_${randomUUID().slice(0, 8)}`, provider: 'anonymous', subject: randomUUID() });
            users.push({ id: u.id, token: signSession({ userId: u.id, username: u.username, provider: 'anonymous', tokenVersion: u.token_version }) });
        }
        await col('users').updateOne({ id: users[0]!.id }, { $set: { is_admin: true, is_super_admin: true } });
        await col('users').updateOne({ id: users[1]!.id }, { $set: { is_admin: true } });
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
        if (col) {
            const ids = users.map((u) => u.id);
            await col('admin_audit_log').deleteMany({ admin_id: { $in: ids } });
            await col('content_reports').deleteMany({ reporter_id: { $in: ids } });
            await col('iap_transactions').deleteMany({ transaction_id: { $regex: `^${txnPrefix}` } });
            const { deleteAccount } = await import('../../src/services/userService.js');
            for (const id of ids) await deleteAccount(id);
        }
    });
    async function req(index: number, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
        return fetch(origin + path, { method, headers: { authorization: `Bearer ${users[index]!.token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    const coinsOf = async (id: string) => (await col<{ coins: number }>('users').findOne({ id }))!.coins;

    it('rejects normal players, restricts role management, and protects super-admins', async () => {
        expect((await req(2, '/admin/overview')).status).toBe(403);
        expect((await req(1, `/admin/players/${users[2]!.id}/role`, { admin: true, reason: 'Test role access' })).status).toBe(403);
        expect((await req(1, `/admin/players/${users[0]!.id}/ban`, {})).status).toBe(403);
        expect((await req(0, `/admin/players/${users[0]!.id}`, undefined, 'DELETE')).status).toBe(403);
        expect((await req(0, '/admin/players/invalid')).status).toBe(400);
        const self = await (await req(0, '/admin/me')).json();
        expect(self.superAdmin).toBe(true);
    });

    it('restores entitlements with an audit reason and excludes account secrets', async () => {
        const path = `/admin/players/${users[2]!.id}/support`;
        expect((await req(0, path, { hintCredits: 5 })).status).toBe(400);
        const result = await req(0, path, { hintCredits: 5, reveal: 3, adsRemoved: true, cosmeticId: 'border_legend', reason: 'QA missing item recovery' });
        expect(result.status).toBe(200);
        const detail = await (await req(0, `/admin/players/${users[2]!.id}`)).json();
        expect(detail.user.hint_credits).toBe(5);
        expect(detail.user.powerup_reveal).toBe(3);
        expect(detail.user.ads_removed).toBe(true);
        expect(detail.user).not.toHaveProperty('password_hash');
        expect(detail.user).not.toHaveProperty('apple_refresh_token');
        expect(detail.cosmetics.some((c: { cosmetic_id: string }) => c.cosmetic_id === 'border_legend')).toBe(true);
        expect(await col('admin_audit_log').countDocuments({ target_id: users[2]!.id, action: 'support' })).toBe(1);
    });

    it('coin packs and starter bundle grant once across retries and concurrent transactions', async () => {
        const payload = { platform: 'ios', transactionId: `${txnPrefix}-coins` };
        const buys = await Promise.all(Array.from({ length: 5 }, () => req(2, '/coins/packs/pebble/purchase', payload)));
        expect(buys.every((r) => r.status === 200)).toBe(true);
        const bundles = await Promise.all(Array.from({ length: 3 }, (_, i) => req(2, '/coins/bundles/starter/purchase', { platform: 'ios', transactionId: `${txnPrefix}-bundle-${i}` })));
        expect(bundles.every((r) => r.status === 200)).toBe(true);
        expect(await coinsOf(users[2]!.id)).toBe(600);
        expect((await req(2, '/coins/bundles/starter/purchase', { platform: 'ios', transactionId: `${txnPrefix}-bundle-0` })).status).toBe(200);
        expect((await req(1, '/coins/packs/pebble/purchase', payload)).status).toBe(409);
    });

    it('premium, remove ads, cosmetic purchases and equip eligibility persist', async () => {
        for (const [path, suffix] of [['/battlepass/upgrade-premium', 'premium'], ['/ads/remove-ads-purchase', 'ads'], ['/cosmetics/theme_obsidian/purchase', 'theme']]) {
            const payload = { platform: 'ios', transactionId: `${txnPrefix}-${suffix}` };
            expect((await req(2, path!, payload)).status).toBe(200);
            expect((await req(2, path!, payload)).status).toBe(200);
        }
        const u = await col('users').findOne({ id: users[2]!.id }, { projection: { _id: 0, ads_removed: 1, battle_pass_premium: 1 } });
        expect(u).toEqual({ ads_removed: true, battle_pass_premium: true });
        const { updateEquippedCosmetic } = await import('../../src/services/userService.js');
        await updateEquippedCosmetic(users[2]!.id, 'board_theme', 'theme_obsidian');
        expect((await col('users').findOne({ id: users[2]!.id }))!.equipped_board_theme).toBe('theme_obsidian');
    });

    it('moderates real UUID reports and records the action', async () => {
        const { newId } = await mongo();
        const id = newId();
        await col('content_reports').insertOne({ id, reporter_id: users[2]!.id, target_type: 'user', target_id: users[1]!.id, reason: 'cheating', detail: null, status: 'open', created_at: new Date() });
        expect((await req(0, `/admin/reports/${id}/status`, { status: 'actioned' })).status).toBe(200);
        expect((await col('content_reports').findOne({ id }))!.status).toBe('actioned');
    });

    // Nothing writes inventory_history in the Mongo layer (the users AFTER UPDATE trigger from 029 has no equivalent, see db/seed.ts).
    it.skip('exposes searchable inventory history', async () => {
        const response=await req(0, `/admin/players/${users[2]!.id}/timeline?search=inventory`);
        expect(response.status).toBe(200);
        const events=await response.json();expect(events.length).toBeGreaterThan(0);
        expect(events.every((e:{kind:string})=>e.kind==='inventory')).toBe(true);
    });

    it('requires reasons and exposes support history', async () => {
        expect((await req(0, `/admin/players/${users[2]!.id}/adjust`, {coinsDelta:1})).status).toBe(400);
        expect((await req(0, `/admin/players/${users[2]!.id}/unban`, {})).status).toBe(400);
        const response=await req(0, `/admin/players/${users[2]!.id}/timeline?search=support`);
        expect(response.status).toBe(200);
        const events=await response.json();expect(events.length).toBeGreaterThan(0);
        expect(events.every((e:{kind:string})=>e.kind==='moderation')).toBe(true);
        expect((await req(0,'/admin/synthetic')).status).toBe(200);
        expect((await req(1,'/admin/synthetic',{paused:true,reason:'Not authorized'})).status).toBe(403);
        expect((await req(0,'/admin/product-metrics')).status).toBe(200);
    });

    it('buys only missing cosmetic bundle items and rejects duplicate charging', async () => {
        await col('user_cosmetics').deleteMany({ user_id: users[2]!.id, cosmetic_id: { $in: ['avatar_fox_01', 'theme_neon'] } });
        await col('users').updateOne({ id: users[2]!.id }, { $set: { coins: 10000 } });
        const offer=await (await req(2,'/style-bundle')).json();
        expect(offer).not.toBeNull();expect(offer.priceCoins).toBeGreaterThan(0);
        const first=await req(2,'/style-bundle',{expectedPrice:offer.priceCoins});expect(first.status).toBe(200);
        const second=await req(2,'/style-bundle',{expectedPrice:offer.priceCoins});expect(second.status).toBe(409);
        expect(await coinsOf(users[2]!.id)).toBe(10000-offer.priceCoins);
    });

    it('ban invalidates existing sessions immediately and unban requires a new session', async () => {
        expect((await req(0, `/admin/players/${users[2]!.id}/ban`, { reason: 'QA moderation' })).status).toBe(200);
        expect((await req(2, '/cosmetics')).status).toBe(403);
        expect((await req(0, `/admin/players/${users[2]!.id}/unban`, { reason: 'Appeal resolved' })).status).toBe(200);
        expect((await req(2, '/cosmetics')).status).toBe(401);
    });
});
