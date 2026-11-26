import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { hasDb, mongo, useDb } from './db.js';

describe.skipIf(!hasDb)('new-account cap per IP', () => {
    useDb();
    let server: Server;
    let origin: string;
    const ids: string[] = [];
    beforeAll(async () => {
        const { redis } = await import('../../src/db/redis.js');
        const keys = await redis.keys('signups:*');
        if (keys.length) await redis.del(...keys);
        const app = express();
        app.use(express.json());
        app.use('/api/auth', (await import('../../src/routes/auth.js')).authRouter);
        server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server.on('listening', resolve));
        origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/auth`;
    });
    afterAll(async () => {
        if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
        const { deleteAccount } = await import('../../src/services/userService.js');
        for (const id of ids) await deleteAccount(id);
        const { redis } = await import('../../src/db/redis.js');
        const keys = await redis.keys('signups:*');
        if (keys.length) await redis.del(...keys);
    });
    const guest = (deviceId: string) =>
        fetch(`${origin}/anonymous`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId }) });

    it('stops minting guests after 30 per hour but still signs returning devices in', async () => {
        const first = `cap-${randomUUID()}`;
        for (let i = 0; i < 30; i++) {
            const res = await guest(i === 0 ? first : `cap-${randomUUID()}`);
            expect(res.status).toBe(200);
            ids.push(((await res.json()) as { user: { id: string } }).user.id);
        }
        expect((await guest(`cap-${randomUUID()}`)).status).toBe(429);
        // An existing device isn't a new account, so it isn't capped.
        expect((await guest(first)).status).toBe(200);
    });
});
