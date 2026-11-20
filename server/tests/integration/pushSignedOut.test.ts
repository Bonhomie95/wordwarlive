import { describe, it, expect, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasDb, mongo, useDb } from './db.js';

// Pushes (leaderboard results included) only reach devices still signed in.
describe.skipIf(!hasDb)('push only reaches signed-in devices', () => {
    useDb();
    const userId = `qa-push-${randomUUID()}`;
    const tok = (s: string) => `${userId}:${s}`;
    afterAll(async () => {
        await (await mongo()).col('push_tokens').deleteMany({ user_id: userId });
        vi.unstubAllGlobals();
    });

    it('skips expired sessions, signed-out devices and stale legacy rows', async () => {
        const push = await import('../../src/services/pushService.js');
        const t = (await mongo()).col('push_tokens');
        const day = 24 * 3600_000;
        const now = Date.now();
        await push.registerPushToken({ userId, token: tok('live'), expiresAt: new Date(now + 10 * day) });
        await push.registerPushToken({ userId, token: tok('expired'), expiresAt: new Date(now - 1000) });
        await push.registerPushToken({ userId, token: tok('signed-out'), expiresAt: new Date(now + 10 * day) });
        await push.removePushToken(tok('signed-out'));
        const legacy = (s: string, age: number) => ({ token: tok(s), user_id: userId, platform: null, created_at: new Date(now - age), updated_at: new Date(now - age) });
        await t.insertMany([legacy('legacy-fresh', 2 * day), legacy('legacy-stale', 40 * day)]);

        const sent: string[] = [];
        vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
            const msgs = JSON.parse(init.body) as { to: string }[];
            sent.push(...msgs.map((m) => m.to));
            return new Response(JSON.stringify({ data: msgs.map(() => ({ status: 'ok' })) }));
        });
        await push.sendPushToUser(userId, { title: 't', body: 'b' });
        expect(sent.sort()).toEqual([tok('legacy-fresh'), tok('live')]);

        await push.removeUserPushTokens(userId); // log out everywhere
        expect(await t.countDocuments({ user_id: userId })).toBe(0);
    });
});
