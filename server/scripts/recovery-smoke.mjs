import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { io } from '../../mobile/node_modules/socket.io-client/build/esm/index.js';
import { createUser, deleteAccount } from '../src/services/userService.ts';
import { signSession } from '../src/auth/jwt.ts';
import { pool } from '../src/db/pool.ts';
import { redis } from '../src/db/redis.ts';
import { env } from '../src/config/env.ts';
assert.notEqual(env.NODE_ENV, 'production');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = `http://127.0.0.1:${port}`,
    node = `qa-recovery-${randomUUID()}`;
let child;
let output = '';
const users = [],
    sockets = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function event(s, name) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            s.off(name, done);
            reject(new Error(`Timeout ${name}`));
        }, 10000);
        function done(data) {
            clearTimeout(timeout);
            resolve(data);
        }
        s.once(name, done);
    });
}
async function boot() {
    child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(port), NODE_ID: node, LOG_LEVEL: 'error' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (b) => (output = (output + b).slice(-4000)));
    child.stderr.on('data', (b) => (output = (output + b).slice(-4000)));
    for (let i = 0; i < 100; i++) {
        try {
            if ((await fetch(base + '/readyz')).ok) return;
        } catch {}
        await pause(100);
    }
    throw new Error('Server failed to start: ' + output);
}
async function kill() {
    if (child && child.exitCode === null) {
        const ended = once(child, 'exit');
        child.kill('SIGKILL');
        await ended;
    }
}
const ack = (s, name, body = {}) => s.timeout(10000).emitWithAck(name, body);
async function connect(u) {
    const s = io(base, {
        auth: { token: u.token },
        transports: ['websocket'],
        reconnection: false,
    });
    sockets.push(s);
    await event(s, 'connect');
    return s;
}
try {
    await boot();
    for (let i = 0; i < 2; i++) {
        const u = await createUser({
            username: 'qr_' + randomUUID().slice(0, 8),
            provider: 'anonymous',
            subject: randomUUID(),
        });
        users.push({
            ...u,
            token: signSession({
                userId: u.id,
                username: u.username,
                provider: 'anonymous',
                tokenVersion: u.token_version,
            }),
        });
        await pool.query('UPDATE users SET powerup_reveal=3,hint_credits=3 WHERE id=$1', [u.id]);
    }
    const a = await connect(users[0]),
        b = await connect(users[1]);
    const code = await (
        await fetch(base + '/api/private-match/code', {
            method: 'POST',
            headers: {
                authorization: 'Bearer ' + users[0].token,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ wordLength: 5 }),
        })
    ).json();
    const found = event(a, 'match_found');
    assert.equal((await ack(b, 'private_join', { code: code.code })).ok, true);
    const match = await found;
    assert.equal((await ack(a, 'powerup_use', { kind: 'reveal' })).ok, true);
    assert.equal((await ack(a, 'hint_request')).ok, true);
    const initial = (
        await pool.query('SELECT state FROM match_checkpoints WHERE id=$1', [match.matchId])
    ).rows[0].state;
    const guess = initial.p1Word === 'CRANE' ? 'SLATE' : 'CRANE';
    assert.equal((await ack(a, 'guess_submit', { guess })).ok, true);
    const balance = (
        await pool.query('SELECT powerup_reveal,hint_credits FROM users WHERE id=$1', [users[0].id])
    ).rows[0];
    a.disconnect();
    const reconnected = await connect(users[0]);
    const history = [];
    reconnected.on('guess_result', (v) => history.push(v));
    assert.equal((await ack(reconnected, 'match_resume')).ok, true);
    assert.equal(history.filter((v) => v.side === 'me').length, 1);
    console.log('PASS disconnect/reconnect: guess history restored');
    await kill();
    for (const s of sockets) s.disconnect();
    await boot();
    const ra = await connect(users[0]),
        rb = await connect(users[1]);
    const restored = [],
        letters = [];
    ra.on('guess_result', (v) => restored.push(v));
    ra.on('powerup_reveal_letter', (v) => letters.push(v));
    assert.equal((await ack(ra, 'match_resume')).ok, true);
    assert.equal((await ack(rb, 'match_resume')).ok, true);
    assert.equal(restored.filter((v) => v.side === 'me').length, 1);
    assert.equal(letters.length, 2);
    assert.equal((await ack(ra, 'hint_request')).ok, false);
    assert.deepEqual(
        (
            await pool.query('SELECT powerup_reveal,hint_credits FROM users WHERE id=$1', [
                users[0].id,
            ])
        ).rows[0],
        balance,
    );
    console.log('PASS SIGKILL/restart: same match, guesses, reveals, hint cap and inventory');
    await pause(2100);
    const ended = event(ra, 'match_over');
    assert.equal((await ack(ra, 'guess_submit', { guess: initial.p1Word })).ok, true);
    await ended;
    const points = (await pool.query('SELECT rank_points FROM users WHERE id=$1', [users[0].id]))
        .rows[0].rank_points;
    await kill();
    for (const s of sockets) s.disconnect();
    await boot();
    assert.equal(
        (await pool.query('SELECT count(*)::int n FROM matches WHERE id=$1', [match.matchId]))
            .rows[0].n,
        1,
    );
    assert.equal(
        (await pool.query('SELECT rank_points FROM users WHERE id=$1', [users[0].id])).rows[0]
            .rank_points,
        points,
    );
    console.log('PASS second restart: completed match not settled twice');
} catch (e) {
    console.error(output);
    throw e;
} finally {
    for (const s of sockets) s.disconnect();
    await kill();
    await pool.query('DELETE FROM match_checkpoints WHERE node_id=$1', [node]);
    for (const u of users) await deleteAccount(u.id);
    await pool.end();
    redis.disconnect();
}
