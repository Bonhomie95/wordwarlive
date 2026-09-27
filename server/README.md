# WordWar Server

Real-time game server for WordWar. Node + Express + Socket.io, Postgres for persistent state, Redis for matchmaking and rate limiting, Groq for AI bots and word curation.

## Run it

```bash
cp .env.example .env
# Generate a JWT secret:
echo "JWT_SECRET=$(openssl rand -hex 64)" >> .env
# Optional but recommended — without it the bot opponent uses a heuristic
# fallback and the daily-word picker falls back to random:
# echo "GROQ_API_KEY=gsk_..." >> .env

docker compose up -d        # postgres + redis
npm install
npm run migrate             # idempotent — also seeds the word bank
npm run dev                 # http://localhost:4000
```

Run unit tests with `npm test`. Use `npm run test:integration` to load `.env`
and include real database tests against a disposable local/test database.
With the local server running and mobile dependencies installed,
`npm run test:smoke` exercises HTTP and two-player socket flows using temporary
accounts. Type-check with `npm run lint`.

## What's in the box

```
src/
├── index.ts           # entry — wires HTTP + Socket.io + DB + word bank
├── config/env.ts      # zod-validated env loader
├── db/                # postgres pool, redis client, migration runner
├── game/              # ★ pure logic: engine, ranks, words, power-ups
├── auth/              # jwt, bcrypt, google, apple, express middleware
├── services/          # user, cosmetics, match, battle pass — DB calls
├── routes/            # REST endpoints (auth, users, matches, cosmetics, battle pass)
├── socket/            # Socket.io server, matchmaking, in-flight match handler
├── ai/                # Groq client, daily-word curator, bot opponent
└── data/words.json    # curated 4–10 letter word bank, loaded on migrate
```

## Polished surfaces

**The engine** (`game/engine.ts`). Pure functions, 23 tests, correct duplicate-letter handling. This is what every guess flows through. Don't break it.

**Auth.** Anonymous (device-id), email + bcrypt, Google, Apple — all return the same JWT shape. Apple's audience is your `APPLE_BUNDLE_ID`; Google accepts any of the IDs in `GOOGLE_CLIENT_IDS` (web, iOS, Android).

**Matchmaking.** Redis sorted-set keyed by rank points. Range starts at `±MATCHMAKING_RANGE_START` (200), expands at 10 s, falls back to a Groq bot at 20 s.

**Match handler.** Server is the source of truth. The target word is never sent until `match_over`. Guesses are rate-limited to one per 2 s via Redis `SET NX EX`. The clock is server-driven.

**Bots.** Guesses are selected from candidates consistent with previous feedback,
with a heuristic fallback if Groq is unavailable. Identity/disclosure behavior
is documented in the root README.

## Purchases, inventory, and operations

- Apple JWS / legacy receipts and Google Play tokens are verified server-side.
  Receipt reservation and entitlement fulfillment share one transaction.
  Duplicate delivery cannot credit twice, even under concurrent requests.
- Production requires IAP enforcement; development shortcuts are not proof of
  store verification. Purchase records label their verification provenance.
- Coin cosmetics, shields, streak rewards, hints, premium upgrades, and pass
  reward claims use atomic balance/inventory writes. Hint caps are one per
  short match or two for words of eight or more letters.
- Reveal avoids already green/revealed positions. Scramble and Lock have real
  server effects and inventory deductions. Reconnect restores match state.
- Redis session revocation disconnects banned/deleted/stale sessions, including
  idle sockets. Incoming socket actions also re-check account validity.
- Admin has protected super-admin roles, support adjustments, reports, audit
  logs, and verified-purchase/rewarded-ad metrics. See [admin README](../admin/README.md).
- Migrations 024 and 025 add super-admin access and purchase provenance, retaining
  receipt tombstones after account deletion to prevent receipt reuse.

See [QA-REPORT.md](../QA-REPORT.md) for verification and remaining store checks.
The Redis adapter and per-node matchmaking are implemented; consult the root
README before adding match-serving nodes.

## API reference (cheat sheet)

```
POST /api/auth/anonymous      { deviceId, desiredUsername? }     -> { token, user }
POST /api/auth/email/register { email, password, username }      -> { token, user }
POST /api/auth/email/login    { email, password }                -> { token, user }
POST /api/auth/google         { idToken }                        -> { token, user }
POST /api/auth/apple          { idToken }                        -> { token, user }

GET    /api/me                                                   -> full self profile
GET    /api/users/:id                                            -> public profile
PATCH  /api/me/equip          { category, cosmeticId }           -> updated self

GET    /api/matches/recent?limit=25                              -> { matches: [...] }

GET    /api/cosmetics                                            -> shop catalog (with `owned`)
GET    /api/me/cosmetics                                         -> { owned: [ids] }
POST   /api/cosmetics/:id/purchase                               -> { ok, cosmeticId }

GET    /api/battlepass/current                                   -> season + your progress + rewards
POST   /api/battlepass/claim         { tier, track }             -> { ok, cosmeticId }
POST   /api/battlepass/upgrade-premium                           -> { ok }

GET    /api/ads/ssv                                              -> AdMob SSV callback (public)
POST   /api/ads/remove-ads-purchase                              -> { ok }

GET    /api/coins/packs                                          -> { packs: [...], hintCost }
POST   /api/coins/packs/:id/purchase                             -> { ok, pack, newBalance }
GET    /api/streak                                               -> play-streak state + milestones

GET    /api/leaderboard?period=daily|weekly|monthly|all_time     -> top-N + your rank
```

All endpoints except `/api/auth/*` and `GET /api/users/:id` require `Authorization: Bearer <jwt>`.

## Socket protocol

Client connects with `io({ auth: { token: '<jwt>' } })`. Events are typed in `src/types/index.ts` (mirrored to mobile). Client → server:

- `queue_join`, `queue_leave`
- `guess_submit({ guess }, ack)`
- `powerup_use({ kind, targetGuessIndex? }, ack)`
- `hint_request({}, ack)` — server picks an unrevealed correct letter and bills the user (free / credit / coins waterfall)

Server → client:

- `queue_status`, `match_found`, `match_start`
- `guess_result` (broadcast on every guess; opponent's `guess` field is `null`)
- `match_tick` (every 1 s)
- `match_over` (final state, both players' guess histories revealed; includes `coinsAwarded`, `coinsTotal`, `streakUpdate` on completion)
- `opponent_scramble`, `error`

## Currency, hints, and streaks

**Coins** — earned currency. Sources: match wins (+5), daily play streak (+10/day), milestone bonuses (50–1000 at days 5/10/25/50/100), rewarded ad daily bonus, and IAP packs ($0.99–$49.99). Spent on hints (50/each) at the moment.

**Hints** — reveal one correct letter in its correct position. **Hard cap of 1 hint per short match, or 2 for words of 8+ letters**, regardless of payment kind — players can't spam coins for unlimited hints. The first hint a user EVER takes (across all matches) is FREE; every subsequent hint costs 50 coins, or 1 hint_credit if they have any (granted at streak milestones). The picker only suggests positions the player hasn't already greened.

**Leaderboards** — pre-aggregated per period (daily / weekly ISO / monthly / all-time) and bucketed by ISO date so top-N reads are index-only. Updated on every match completion (bots filtered). Top 3 get gold/silver/bronze medal display. Each entry stores a snapshot of the player's rank_points so two players tied on wins are ordered by skill.

**Daily play streak** — advanced server-side when a match COMPLETES (not when the app opens). UTC-day boundaries. Milestones at 5/10/25/50/100 days each grant coins + hint credits. `play_streak_best` tracked alongside the active streak.

Every coin grant and spend is logged to the `coin_grants` table for audit; every hint redemption to `hint_uses`.
