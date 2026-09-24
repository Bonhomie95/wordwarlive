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
- `IAP_ENFORCE=true` (the default when `NODE_ENV=production`) +
  `APPLE_BUNDLE_ID` + `GOOGLE_PLAY_PACKAGE_NAME` +
  `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. iOS purchases are verified offline from
  the StoreKit 2 signed transaction (Apple root pinned in
  `src/iap/appleJws.ts`); `APPLE_IAP_SHARED_SECRET` is only a fallback for
  legacy base64 receipts.
- `APPLE_TEAM_ID` + `APPLE_KEY_ID` + `APPLE_PRIVATE_KEY` (Sign in with Apple
  key) — required so account deletion revokes the user's Apple token, which
  Apple mandates. The server warns at boot when they're missing.
- `SUPPORT_EMAIL` — shown on the hosted legal pages.
- `METRICS_TOKEN` — otherwise `/metrics` is public.
- `SENTRY_DSN` (optional) + `npm i @sentry/node` to enable error reporting.
- `GROQ_API_KEY` (optional — bots fall back to a heuristic without it).

### Hosted legal pages
The server renders `server/legal/PRIVACY.md` and `TERMS.md` at
`GET /legal/privacy`, `GET /legal/terms`, plus a Play-required account-deletion
page at `GET /legal/delete-account`. Use those URLs in App Store Connect, Play
Console (Privacy Policy + "Delete account URL" in Data safety) and AdMob. The
app links to them by default (`<EXPO_PUBLIC_API_URL>/legal/...`); override
with `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` /
`EXPO_PUBLIC_DELETE_ACCOUNT_URL` if you host them elsewhere.

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
`runtimeVersion` uses the `appVersion` policy, so bump `VERSION` in
`app.config.ts` for each store release.

### Build-time env (production)
`app.config.ts` layers release-critical values onto `app.json` and **fails a
production EAS build** when any of these are missing or still Google's samples:
`EXPO_PUBLIC_API_URL` (https), `ADMOB_IOS_APP_ID`, `ADMOB_ANDROID_APP_ID`,
`EXPO_PUBLIC_ADMOB_{BANNER,INTERSTITIAL,REWARDED}_{IOS,ANDROID}_ID`. Also set
`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` (Google login is hidden when absent) and
`EXPO_PUBLIC_SUPPORT_EMAIL`. Put them in `eas.json` → `build.production.env`
or in EAS environment variables — **`.env` is not uploaded to EAS Build.**
Replace the `https://api.wordwar.app` placeholder in `eas.json` with your real
API host.

### Before first submission
See `store-assets/STORE-LISTING.md` §7–8 for the full, current checklist
(products to create, data-safety table, per-store steps). In short:
- [ ] Paid Apple team + App ID capabilities (Sign in with Apple, Push, IAP);
      Sign in with Apple key on the server.
- [ ] In-app products created on both stores (ids in STORE-LISTING §7).
- [ ] Real AdMob app + unit ids in the build env; GDPR/US-state messages
      configured in AdMob; rewarded SSV URL pointed at `/api/ads/ssv`.
- [ ] Apple App Privacy + Play Data Safety filled from the table; Play
      "Delete account URL" = `/legal/delete-account`.
- [ ] FCM v1 credentials uploaded to EAS for Android push; `eas init` so the
      project has an EAS `projectId`.
- [ ] Test purchases with sandbox / license-tester accounts on real devices.

## CI
`.github/workflows/ci.yml` runs on push/PR: server typecheck + tests (with
Postgres + Redis services and migrations) and mobile typecheck.
