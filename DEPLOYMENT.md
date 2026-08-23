# Deployment & Production Checklist

## Server

### Build & run
```bash
cd server
docker build -t wordwar-server .
docker run -p 4000:4000 --env-file .env wordwar-server
```
The image runs as non-root and has a container `HEALTHCHECK` against `/readyz`.
Point your platform's health check at **`/readyz`** (checks Postgres + Redis),
not `/healthz` (liveness only).

### Required production env (see `server/.env.example`)
- `NODE_ENV=production`
- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET` (>= 32 chars — `openssl rand -hex 64`)
- `CORS_ORIGINS` — lock to your real client origins (not `*`)
- `TRUST_PROXY` — set to the number of proxy hops in front of the server (e.g. `1`)
- `IAP_ENFORCE=true` + `APPLE_IAP_SHARED_SECRET` + `GOOGLE_PLAY_PACKAGE_NAME` +
  `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — **only after the mobile client sends
  receipts** (see the IAP note in memory).
- `SENTRY_DSN` (optional) + `npm i @sentry/node` to enable error reporting.
- `GROQ_API_KEY` (optional — bots fall back to a heuristic without it).

### On deploy
1. Run migrations: `npm run migrate` (idempotent; also seeds the word bank).
2. Ensure automated **database backups / PITR** are configured on your Postgres
   host (managed Postgres with daily snapshots + WAL retention is strongly
   recommended before launch).
3. Store secrets in your platform's secret manager, not a committed `.env`.
   Rotate `JWT_SECRET` before go-live and confirm no real `.env` was ever
   committed (`git log --all -- server/.env`).
4. Graceful shutdown: the server traps SIGTERM/SIGINT, stops new matchmaking,
   gives in-flight matches up to ~25s to finish, then drains sockets + pools.
   Give your orchestrator a **terminationGracePeriod of at least 35s**.

### Scaling
The realtime layer has two independent limits:

1. **Match runtime is node-local.** Live match state (timers, guess handling,
   in-memory registry) lives in the process that started the match. The
   `@socket.io/redis-adapter` is wired up, so `io.to(socketId)` and presence
   (Redis-backed) work **across** nodes — friend challenges / private invites
   are multi-node-correct. But a match's two sockets must be handled by the
   node that owns the match. For horizontal scale:
   - Put the load balancer in **sticky-session** mode (hash by user) so a
     user's HTTP + socket land on the same node.
   - Matchmaking co-locates a pair on the enqueuing node; for true N-node
     match distribution you'd shard match state into Redis (future work).
   Practically: one node handles **1,000–2,000 concurrent players**; a small
   sticky-routed cluster scales presence/social features and lets you run
   several match-serving nodes.

2. **Match-end DB writes** are the per-node throughput cost. These are batched
   (single multi-row leaderboard upsert) and fanned out concurrently, and the
   pool is `DB_POOL_MAX` (default 50). Put Postgres behind **PgBouncer**
   (transaction pooling) and raise `DB_POOL_MAX` when adding nodes.

### Monitoring
- **Liveness:** `GET /healthz`. **Readiness:** `GET /readyz` (Postgres+Redis).
- **Metrics:** `GET /metrics` → `{ activeMatches, queueDepth, onlineUsers,
  pool, memory, uptimeSeconds }`. Protect it with `METRICS_TOKEN` if public.
- **Errors:** set `SENTRY_DSN` + `npm i @sentry/node`.

### Load testing
A k6 script lives at `server/loadtest/matches.js` — it hammers auth + the
match-completion path so you can find the pool/PgBouncer ceiling before real
traffic. Run: `k6 run -e API=http://localhost:4000 server/loadtest/matches.js`.

### Push notifications
Friend-challenge invites are delivered via Expo Push (so a backgrounded app
still gets them). No server key is required for Expo's push service; devices
register their token at `POST /api/push/register` after sign-in. Ensure the
mobile build has an EAS `projectId` so `getExpoPushTokenAsync` works.

## Mobile

### Builds (EAS)
```bash
cd mobile
eas build --profile production --platform all      # store builds
eas build --profile preview --platform android     # internal APK
eas submit --profile production
```
`eas.json` defines development / preview / production profiles with
auto-incrementing build numbers and `appVersionSource: remote`.
`runtimeVersion` uses the `appVersion` policy, so bump `expo.version` in
`app.json` for each store release.

### Before first submission
- [ ] Host `PRIVACY.md` **and `TERMS.md`** at public URLs; link them in App
      Store Connect, Google Play, and AdMob.
- [ ] Complete Apple privacy nutrition labels + Google Data Safety form.
- [ ] Verify in-app **Delete account** (Settings → Account) — required by Apple.
- [ ] Swap the placeholder `assets/` icon + splash for final artwork.
- [ ] Replace AdMob test unit IDs with production IDs via the `EXPO_PUBLIC_ADMOB_*` env.
- [ ] Wire a real StoreKit / Play Billing IAP flow, then set `IAP_ENFORCE=true`.

## CI
`.github/workflows/ci.yml` runs on push/PR: server typecheck + tests (with
Postgres + Redis services and migrations) and mobile typecheck.
