// k6 load test for WordWar.
//
// Exercises the two hottest paths: anonymous auth (account creation +
// token) and the authenticated REST surface that a client hits around every
// match (/api/me, /api/leaderboard, /api/matches/recent). The socket match
// runtime isn't driven here (k6 has limited ws support for socket.io's
// protocol) — this focuses on the DB-bound HTTP paths that gate throughput,
// especially the leaderboard read and the per-request auth revocation check.
//
// Usage:
//   k6 run -e API=http://localhost:4000 server/loadtest/matches.js
//   k6 run -e API=https://staging.example.com -e VUS=200 -e DURATION=2m server/loadtest/matches.js
//
// Install k6: https://k6.io/docs/get-started/installation/

import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const API = __ENV.API || 'http://localhost:4000';
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '1m';

export const options = {
    scenarios: {
        players: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '15s', target: VUS },
                { duration: DURATION, target: VUS },
                { duration: '10s', target: 0 },
            ],
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.02'],
        http_req_duration: ['p(95)<800'],
    },
};

function authHeaders(token) {
    return { headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } };
}

export default function () {
    // 1. Anonymous sign-in (creates a user the first time, returns a JWT).
    const deviceId = `loadtest-${__VU}-${randomString(16)}`;
    const authRes = http.post(
        `${API}/api/auth/anonymous`,
        JSON.stringify({ deviceId }),
        { headers: { 'content-type': 'application/json' } }
    );
    check(authRes, { 'auth 200': (r) => r.status === 200 });
    const token = authRes.json('token');
    if (!token) {
        sleep(1);
        return;
    }
    const h = authHeaders(token);

    // 2. The bundle a client fetches around a match.
    const me = http.get(`${API}/api/me`, h);
    check(me, { 'me 200': (r) => r.status === 200 });

    const lb = http.get(`${API}/api/leaderboard?period=weekly&mode=overall&limit=50`, h);
    check(lb, { 'leaderboard 200': (r) => r.status === 200 });

    const recent = http.get(`${API}/api/matches/recent?limit=25`, h);
    check(recent, { 'recent 200': (r) => r.status === 200 });

    // 3. Coin pack catalog (public, no auth) + streak state.
    http.get(`${API}/api/coins/packs`);
    http.get(`${API}/api/streak`, h);

    sleep(Math.random() * 2 + 1);
}
