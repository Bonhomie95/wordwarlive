// Run against a local dev API: node --import tsx --import dotenv/config scripts/smoke.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from '../../mobile/node_modules/socket.io-client/build/esm/index.js';
import { env } from '../src/config/env.ts';
import { pool } from '../src/db/pool.ts';
import { redis } from '../src/db/redis.ts';
import { createUser, deleteAccount } from '../src/services/userService.ts';
import { signSession } from '../src/auth/jwt.ts';
import { banPlayer } from '../src/services/adminService.ts';
assert.notEqual(env.NODE_ENV, 'production', 'Smoke test is local-development only');
const base = `http://localhost:${env.PORT}`;
const players = [];
const sockets = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function event(socket, name, ms = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(`Timed out: ${name}`)); }, ms);
        const listener = (value) => { clearTimeout(timer); resolve(value); };
        socket.once(name, listener);
    });
}
const ack = (s, name, body = {}) => s.timeout(10000).emitWithAck(name, body);
async function api(index, path, body) {
    const res = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${players[index].token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json();
    assert.equal(res.ok, true, `${path}: ${JSON.stringify(data)}`);
    return data;
}
try {
    for (let i = 0; i < 2; i++) {
        const u = await createUser({ username: `sm_${randomUUID().slice(0, 8)}`, provider: 'anonymous', subject: `qa-${randomUUID()}` });
        const token = signSession({ userId: u.id, username: u.username, provider: 'anonymous', tokenVersion: u.token_version });
        players.push({ ...u, token });
        await pool.query('UPDATE users SET powerup_reveal = 12, powerup_lock = 2, powerup_scramble = 2, coins = 1000 WHERE id = $1', [u.id]);
        const socket = io(base, { auth: { token }, transports: ['websocket'], reconnection: false });
        sockets.push(socket);
        await event(socket, 'connect');
    }
    const [a, b] = sockets;
    for (const path of ['/me','/cosmetics','/me/cosmetics','/coins/packs','/streak','/battlepass/current','/leaderboard','/matches/recent','/replays','/friends','/blocks','/settings','/daily','/daily/board','/seasons/current','/mystery/pending']) await api(0, path);
    console.log('PASS authenticated screen APIs');
    const { code } = await api(0, '/private-match/code', { wordLength: 5 });
    const foundA = event(a, 'match_found');
    const foundB = event(b, 'match_found');
    assert.equal((await ack(b, 'private_join', { code })).ok, true);
    const [ma, mb] = await Promise.all([foundA, foundB]);
    assert.equal(ma.matchId, mb.matchId);
    assert.equal('word' in ma, false);
    assert.equal((await ack(a, 'powerup_use', { kind: 'invalid' })).ok, false);
    const scrambled = event(b, 'opponent_scramble');
    assert.equal((await ack(a, 'powerup_use', { kind: 'scramble' })).ok, true);
    await scrambled;
    const locked = event(b, 'powerup_locked');
    assert.equal((await ack(a, 'powerup_use', { kind: 'lock' })).ok, true);
    assert.equal((await locked).durationMs, 8000);
    assert.equal((await ack(b, 'powerup_use', { kind: 'reveal' })).ok, false);
    const letters = {};
    const hint = await ack(a, 'hint_request');
    assert.equal(hint.ok, true);
    letters[hint.position] = hint.letter;
    assert.equal((await ack(a, 'hint_request')).ok, false);
    for (let i = 0; i < 4; i++) {
        const reveal = event(a, 'powerup_reveal_letter');
        assert.equal((await ack(a, 'powerup_use', { kind: 'reveal' })).ok, true);
        const letter = await reveal;
        assert.equal(letter.position in letters, false);
        letters[letter.position] = letter.letter;
    }
    assert.equal((await ack(a, 'powerup_use', { kind: 'reveal' })).ok, false);
    const inventory = (await api(0, '/me')).powerups;
    assert.equal(inventory.reveal, 8);
    assert.equal(inventory.scramble, 1);
    assert.equal(inventory.lock, 1);
    a.disconnect();
    a.connect();
    await event(a, 'connect');
    const restored = [];
    a.on('powerup_reveal_letter', (v) => restored.push(v));
    assert.equal((await ack(a, 'match_resume')).ok, true);
    assert.equal(restored.length, 5);
    const doneA = event(a, 'match_over');
    const doneB = event(b, 'match_over');
    const word = Array.from({ length: 5 }, (_, i) => letters[i]).join('');
    assert.equal((await ack(a, 'guess_submit', { guess: word })).ok, true);
    await Promise.all([doneA, doneB]);
    console.log('PASS private match, hidden answer, reveal/scramble/lock, hint cap, reconnect, solve and reward persistence');

    const invite = event(b, 'friend_challenge_incoming');
    assert.equal((await ack(a, 'friend_challenge', { friendId: players[1].id })).ok, true);
    const incoming = await invite;
    const declined = event(a, 'friend_challenge_declined');
    assert.equal((await ack(b, 'friend_challenge_respond', { challengeId: incoming.challengeId, accept: false })).ok, true);
    await declined;
    console.log('PASS friend challenge and decline');

    await api(0, '/mystery/submit', { word: 'APPLE' });
    await api(1, '/mystery/submit', { word: 'GRAPE' });
    const mysteryA = event(a, 'match_found');
    const mysteryB = event(b, 'match_found');
    assert.equal((await ack(a, 'mystery_queue')).ok, true);
    assert.equal((await ack(b, 'mystery_queue')).ok, true);
    assert.equal((await mysteryA).mode, 'mystery');
    await mysteryB;
    const overA = event(a, 'match_over');
    const overB = event(b, 'match_over');
    await sleep(2100); // guess limiter from the previous match
    assert.equal((await ack(a, 'guess_submit', { guess: 'GRAPE' })).ok, true);
    await Promise.all([overA, overB]);
    console.log('PASS mystery duel uses the opponent submission');

    const disconnected = event(b, 'disconnect');
    await banPlayer(players[1].id, players[0].id, 'QA live ban');
    await disconnected;
    b.connect();
    const rejection = await event(b, 'connect_error');
    assert.equal(rejection.message, 'Account suspended');
    console.log('PASS live ban disconnects socket and rejects reconnect');
} finally {
    for (const socket of sockets) {
        if (socket.connected) await ack(socket, 'match_quit').catch(() => {});
        socket.disconnect();
    }
    await sleep(250);
    for (const player of players) await deleteAccount(player.id);
    await pool.end();
    redis.disconnect();
}
