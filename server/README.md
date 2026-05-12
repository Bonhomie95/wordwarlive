# WordWar Server

Real-time game server for WordWar Live. Node + Express + Socket.io, Postgres for persistent state, Redis for matchmaking and rate limiting, Groq for AI bots and word curation.

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

Run tests with `npm test`. Type-check only with `npm run lint`.

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
└── data/words.json    # curated 5–8 letter word bank, loaded on migrate
```

## Polished surfaces

**The engine** (`game/engine.ts`). Pure functions, 23 tests, correct duplicate-letter handling. This is what every guess flows through. Don't break it.

**Auth.** Anonymous (device-id), email + bcrypt, Google, Apple — all return the same JWT shape. Apple's audience is your `APPLE_BUNDLE_ID`; Google accepts any of the IDs in `GOOGLE_CLIENT_IDS` (web, iOS, Android).

**Matchmaking.** Redis sorted-set keyed by rank points. Range starts at `±MATCHMAKING_RANGE_START` (200), expands at 10 s, falls back to a Groq bot at 20 s.

**Match handler.** Server is the source of truth. The target word is never sent until `match_over`. Guesses are rate-limited to one per 2 s via Redis `SET NX EX`. The clock is server-driven.

**Bot.** Groq picks from a **pre-filtered** candidate list — every candidate already satisfies the tile constraints from the bot's history, so the model can't "cheat" or pick something illegal. Falls back to a clean heuristic if `GROQ_API_KEY` is missing. Bot usernames start with `bot-` and the `isBot` flag is sent to clients per the brief.

## Scaffolded surfaces (you'll want to flesh these out)

**Power-ups.** The protocol is wired (`powerup_use` event, ack envelope) but the server-side effects are stubbed. To finish:

- **Reveal**: pick an unrevealed letter from `match.word`, send `{kind:'reveal', letter, position}` to *only* the requester
- **Scramble**: emit `opponent_scramble` to the opposing socket; the client renders the visual effect
- **Lock**: server-side flag preventing the opponent's `powerup_use` for N seconds

Inventory tracking belongs in a `user_powerups` table (or denormalized columns on `users`). See `game/powerups.ts` for the earn rules.

**IAP receipt verification.** `cosmeticsService.grantCosmetic` and `battlePassService.unlockPremium` both have `TODO(prod)` — they accept the client's claim as-is. Before launch, plug in [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi) and [Google Play Developer API](https://developers.google.com/android-publisher) receipt verification.

**Daily words.** `ai/dailyWord.ts` is wired but isn't called from anywhere yet. Either expose it on a route (`GET /api/daily-word`) or run it in a daily cron and use it as the word for a "Daily" match mode.

**Persistence on disconnect.** Disconnect = forfeit immediately. Many games give a 10-15 s reconnect grace period; that's a `setTimeout` away in `matchHandler.handleDisconnect`.

**Socket scaling.** Single-process today. To scale across multiple servers, add the [`@socket.io/redis-adapter`](https://socket.io/docs/v4/redis-adapter/) — Redis is already a dependency.

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

**Hints** — reveal one correct letter in its correct position. **Hard cap of 1 hint per match**, regardless of payment kind — players can't spam coins for unlimited hints. The first hint a user EVER takes (across all matches) is FREE; every subsequent hint costs 50 coins, or 1 hint_credit if they have any (granted at streak milestones). The picker only suggests positions the player hasn't already greened.

**Leaderboards** — pre-aggregated per period (daily / weekly ISO / monthly / all-time) and bucketed by ISO date so top-N reads are index-only. Updated on every match completion (bots filtered). Top 3 get gold/silver/bronze medal display. Each entry stores a snapshot of the player's rank_points so two players tied on wins are ordered by skill.

**Daily play streak** — advanced server-side when a match COMPLETES (not when the app opens). UTC-day boundaries. Milestones at 5/10/25/50/100 days each grant coins + hint credits. `play_streak_best` tracked alongside the active streak.

Every coin grant and spend is logged to the `coin_grants` table for audit; every hint redemption to `hint_uses`.
