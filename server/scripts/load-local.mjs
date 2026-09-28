// Isolated local API process; uses disposable users in the configured development DB.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { io } from '../../mobile/node_modules/socket.io-client/build/esm/index.js';
import { env } from '../src/config/env.ts';
import { createUser, deleteAccount } from '../src/services/userService.ts';
import { signSession } from '../src/auth/jwt.ts';
import { pool } from '../src/db/pool.ts';
import { redis } from '../src/db/redis.ts';
assert.notEqual(env.NODE_ENV, 'production', 'Use a development database only');
const count = Number(process.env.LOAD_PLAYERS || 20);
assert.ok(Number.isInteger(count) && count >= 1 && count <= 100, 'LOAD_PLAYERS must be 1–100');
const reservation = createServer().listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(r => reservation.close(r));
const base = `http://127.0.0.1:${port}`;
const users = [], sockets = [], timings = [], failures = [];
let child, logs = '';
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
    child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        env: { ...process.env, PORT: String(port), NODE_ID: `load-${randomUUID()}`, LOG_LEVEL: 'error' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', b => { logs = (logs + b).slice(-3000); });
    child.stderr.on('data', b => { logs = (logs + b).slice(-3000); });
    let ready = false;
    for (let i = 0; i < 150; i++) {
        try { if ((await fetch(base + '/readyz', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
        await delay(100);
    }
    assert.ok(ready, `API did not start: ${logs}`);
    for (let i = 0; i < count; i++) {
        const user = await createUser({ username: `ld_${randomUUID().slice(0,8)}`, provider: 'anonymous', subject: `load-${randomUUID()}` });
        users.push(user);
    }
    const started = performance.now();
    await Promise.allSettled(users.map(async user => {
        const token = signSession({ userId: user.id, username: user.username, provider: 'anonymous', tokenVersion: user.token_version });
        const socket = io(base, { auth: { token }, transports: ['websocket'], reconnection: false });
        sockets.push(socket);
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Socket timed out')), 10000);
                socket.once('connect', () => { clearTimeout(timer); resolve(); });
                socket.once('connect_error', e => { clearTimeout(timer); reject(e); });
            });
            for (const path of ['/api/me', '/api/leaderboard?period=weekly&mode=overall', '/api/matches/recent', '/api/cosmetics', '/api/coins/packs', '/api/style-bundle']) {
                const begin = performance.now();
                try {
                    const response = await fetch(base + path, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
                    await response.arrayBuffer();
                    timings.push(performance.now() - begin);
                    if (!response.ok) failures.push(`${path}: ${response.status}`);
                } catch (e) { failures.push(`${path}: ${e.message}`); }
            }
        } catch (e) { failures.push(`socket: ${e.message}`); }
    }));
    timings.sort((a,b) => a-b);
    const percentile = p => Math.round(timings[Math.max(0, Math.ceil(timings.length*p)-1)] || 0);
    console.log(JSON.stringify({ players: count, connectedSockets: sockets.filter(s => s.connected).length, requests: timings.length, elapsedMs: Math.round(performance.now()-started), p50Ms: percentile(.5), p95Ms: percentile(.95), failures }, null, 2));
    assert.equal(failures.length, 0, 'Requests/connections failed');
    assert.equal(timings.length, count * 6);
    assert.ok(percentile(.95) < 800, 'Local REST p95 exceeded 800ms');
    console.log('PASS local REST burst + concurrent sockets (not a sustained match-capacity benchmark)');
} finally {
    sockets.forEach(s => s.disconnect());
    if (child && child.exitCode === null) {
        const stopped = once(child, 'exit');
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 35000);
        await stopped; clearTimeout(timer);
    }
    for (const user of users) await deleteAccount(user.id);
    await pool.end(); await redis.quit();
}
