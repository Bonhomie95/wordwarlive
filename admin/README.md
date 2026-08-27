# WordWar Admin

A Vite + React admin dashboard for operating WordWar: player management,
moderation, economy, and full read access to every player's data.

## What you can do

- **Dashboard** — total players, online now, DAU/WAU, new signups, matches
  played, coins in circulation, open reports, bans, admins, bots, active season.
- **Players** — searchable, filterable (real / bots / banned / premium / admins),
  sortable table with rank position, points + tier, W/L, win %, play streak,
  best streak, coins, last played, and status. Click any row for the dossier.
- **Player detail** — every field on the account: rank + global position,
  record + win rate, streaks + percentile, coins, hint credits, battle-pass XP,
  join/last-played, equipped cosmetics, plus recent matches, the full coin
  ledger, cosmetics owned, purchases, reports for/against, and battle-pass claims.
  Actions: **ban / unban**, **adjust coins & rank**, **grant / revoke admin**,
  and **permanent delete** (with a type-to-confirm guard).
- **Leaderboard** — top 100 by rank points (bots excluded).
- **Matches** — the 100 most recent completed matches.
- **Reports** — the moderation queue with status filters; action or dismiss.
- **Economy** — coins in circulation, all-time granted/spent, and a per-source
  breakdown of the coin economy.
- **Purchases** — recent verified in-app purchases.
- **Audit log** — every mutating admin action (who, what, when, details).

Bans take effect immediately: the server drops the player's live socket and
rejects their token on the next request (their sessions are revoked on ban).

## Access & the first admin

Admin routes are gated by `requireAuth + requireAdmin`; only users with
`is_admin = true` pass. Admins sign in with their **email + password** account.

Bootstrap the first admin one of two ways (from `server/`):

```bash
# 1. Promote an existing email account by CLI:
npm run make-admin -- you@wordwar.app

# 2. Or set ADMIN_EMAILS in the server env — those emails are promoted at
#    boot and on their next login:
#    ADMIN_EMAILS=you@wordwar.app,ops@wordwar.app
```

The account must have signed up with **email auth** (it needs a password to log
in here). After that, admins can promote/demote others from the player detail
page.

## Running it

```bash
cd admin
npm install
# Point the dev proxy at your running API (defaults to http://localhost:4000):
echo "VITE_API_TARGET=http://localhost:4000" > .env
npm run dev            # http://localhost:5173
```

Build for production:

```bash
npm run build          # → dist/
```

Serve `dist/` behind the same origin as the API (or any static host). In
production, add the admin's origin to the server's `CORS_ORIGINS` if it is
served from a different origin than the API. The app is a single-page app using
hash routing, so no server rewrite rules are required.

The bearer token is stored in `localStorage`; a 401/403 clears it and returns
to the login screen.
