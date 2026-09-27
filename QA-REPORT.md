# WordWar audit — 27 September 2026

## Running locally

| Component | Address / port |
| --- | --- |
| API and Socket.IO | http://localhost:6011 |
| Mobile Metro development server | http://localhost:8082 |
| Admin dashboard | http://localhost:5174 |
| Readiness (Postgres + Redis) | http://localhost:6011/readyz |

Mobile is a native app served by Metro; port 8082 is not a browser version of
its screens. A physical device needs the development machine's LAN address
instead of localhost. The admin proxy targets port 6011. Other existing
projects on ports 8081 and 5173 were left alone.

Restart with:

```sh
# server/
npm run migrate
npm run dev  # current local .env sets PORT=6011

# mobile/
EXPO_PUBLIC_API_URL=http://localhost:6011 npx expo start --port 8082 --host lan

# admin/
VITE_API_TARGET=http://localhost:6011 npm run dev -- --port 5174
```

## Findings and changes

### Purchase reliability and item delivery

- Receipt reservation and entitlement delivery now commit together. An error
  after updating coins rolls back both, so retry can safely fulfill the purchase.
- Concurrent copies of the same receipt cannot double-credit. Different accounts
  cannot reuse a receipt, and product mismatch is rejected.
- Lock ordering avoids a deadlock when concurrent starter purchases attempt to
  upgrade foreign-key locks. The starter bundle cap is enforced under a user lock.
- All real-money routes use the transactional fulfillment callback: coin packs,
  starter bundle, cosmetics, remove ads, and premium battle pass.
- Deleted accounts leave unlinked transaction tombstones, preventing
  delete/recreate receipt reuse. Privacy/deletion text reflects this retention.
- Store verification is mandatory in production. Purchase records distinguish
  verified store transactions from local development/legacy records.
- iOS uses StoreKit 2 purchase tokens/JWS when available; legacy receipts check
  bundle, exact transaction, and cancellation status, with a network timeout.
- Native billing initialization, missing products, and restore failures now show
  actionable errors. Release builds cannot silently simulate absent native IAP.
- The client prevents overlapping purchase requests and refreshes entitlements
  after reconciliation. Mutating HTTP requests are not automatically retried.

### Inventory, competitive play, and rewards

- Coin cosmetics and shields debit and grant atomically. Concurrent cosmetic
  requests charge only once; shield purchases respect the inventory cap.
- Hints serialize against the player account, enforce per-match caps in the DB,
  and avoid previously revealed positions. Short words allow one hint; 8+ allow two.
- Reveal avoids green and previously revealed letters. A match ending during
  an inventory request refunds that use. Hint/power-up requests cannot overlap.
- Reconnect restores revealed letters and remaining lock time. A start guard
  prevents one player being placed in overlapping active matches.
- Premium status expires on battle-pass season rollover; upgrades preserve
  current-season XP, and reward claims grant cosmetics atomically.
- Streak advancement, milestone credits/coins, and rewarded XP are atomic.
  Streak display respects shields.
- Rank season reset is atomic, updates the displayed tier, and never raises a
  below-floor player to 1000 points merely because a new season starts.
- Benign dictionary words such as GRAPE no longer trip substring profanity
  filtering; offensive compounds remain blocked.
- Friend challenge word lengths must be integers.

### UI/UX and added features

- Shop has Shop / My items views and real cosmetic previews. Owned exclusive
  rewards are included in the catalog so they can actually be equipped.
- Free cosmetics bypass store billing. Coin prices and pack badges use accurate
  copy. The pass handles max-tier progress and inactive seasons properly.
- Tiles use the intended stagger delay and readable text on bright backgrounds;
  color-blind mode adds shape indicators and accessibility labels.
- A solved Daily board no longer displays unused active guess rows.
- Replays now open a detail sheet showing both players' recorded boards, with
  loading, retry, close, and empty-history states. Draws have their own label.
- Mystery Duel instructions now consistently say each player guesses the other
  player's submission.
- Player reports include Suspected cheating.
- Admin login fields have explicit accessible labels and required validation;
  player rows support keyboard navigation and search explains the Enter action.
- README files were updated to remove obsolete claims that inventory effects,
  reconnect, receipt verification, assets, and push integration were stubs.

### Super-admin and support

- A distinct `is_super_admin` role protects root accounts. Only super-admins
  grant/revoke ordinary admin status; ordinary admins cannot modify admins.
- Root accounts cannot be banned, deleted, or demoted through the panel.
- Support can restore cosmetics and adjust ads removal, current-season premium,
  hint credits, Reveal/Scramble/Lock inventory, and shields, with a required
  complaint/reason field and an atomic audit entry.
- Existing operational tools cover player search/dossiers, match history,
  coin/rank adjustments, bans, report moderation, purchases, and audit history.
- Password hashes, Apple refresh tokens, and authentication subjects are removed
  from dossier responses. Super-admin does not need authentication secrets.
- Bans publish session revocation through Redis, disconnect idle/live sockets,
  end the banned player's active match, and reject stale HTTP/socket tokens.
  Unbanning requires a fresh login.
- Report status accepts real UUID report IDs and surfaces failures in the UI.

Migration 024 promotes pre-existing admins to super-admin. Review that list
when deploying. If this environment has no operator account, promote the intended
existing email account from `server/` with `npm run make-admin -- your-email` or
configure `ADMIN_EMAILS`. A disposable QA super-admin was used for browser tests
and removed afterward. No permanent operator identity was guessed or created.
Cash refunds remain in the Apple/Google consoles.

### Revenue

The implementation supports coin packs, a one-time starter bundle, cosmetic
sales, premium passes, remove ads, and rewarded ads. This work improves delivery,
restore behavior, item visibility, and purchase trust, reducing avoidable loss.
Admin Economy now displays 30-day verified purchase counts, paying players,
product breakdowns, and rewarded-ad completions/viewers, excluding test activity.
These are activity metrics, not net cash revenue; commissions, tax, currency,
refunds, and ad payouts remain in store/AdMob financial reports.

More revenue is possible but not proven by code review. Use real retention and
conversion data to compare starter offer uptake, cosmetic popularity, pass
completion, and voluntary rewarded-ad usage before changing prices or ad load.
No fabricated revenue projection or unmeasured pricing increase was introduced.

## Verification performed

- Server: **88 tests passed across 17 files**, including database integration
  tests, receipt rollback/retry/concurrency, delete/recreate replay defense,
  inventory charging, hint caps, premium rollover, role enforcement, support
  audit records, paid entitlements/equip, report moderation, and bans.
- Server TypeScript check passed.
- Mobile TypeScript check and Expo lint with zero warnings passed.
- Admin TypeScript and production build passed; admin build added to CI.
- Local live HTTP/Socket.IO smoke test passed using disposable accounts:
  authenticated screen APIs; private match creation/join; hidden target;
  Reveal, Scramble and Lock; hint caps; reconnect restoration; solving and
  reward persistence; replay retrieval; friend challenge/decline; Mystery Duel
  using the opponent's submission; immediate ban disconnect/reconnect rejection.
- iPhone 17 / iOS 27 simulator inspection covered home, Shop/My items,
  purchase-unavailable feedback, pass confirmation/cancel, profile, settings,
  completed Daily, friends/code generation, replay detail, and Mystery screen.
- Browser inspection covered admin login, dashboard, player search, protected
  super-admin dossier, support adjustment dialog, reports, Economy, purchases,
  and logout. Destructive/support mutations were tested through disposable
  integration fixtures rather than real player accounts.

Commands:

```sh
# server/
npm run test:integration
npm run lint
npm run test:smoke  # server must already run; mobile dependencies required

# mobile/
npx tsc --noEmit
npx expo lint --max-warnings 0

# admin/
npm run build
```

## Remaining verification and limits

This is not a claim that every button, device, or production integration passed.

1. **Real billing:** App Store Connect / Play Console products, signing, test
   accounts, and verifier credentials must be configured. Test successful,
   cancelled, pending, offline-after-payment, reinstall/restore, repeat, and
   refunded purchases using Apple sandbox/TestFlight and Play license testers.
   The simulator's unavailable catalog could not complete a real purchase.
   Transaction delivery tests used explicit local development verification.
2. **Refund lifecycle:** verification checks the submitted purchase; automated
   post-purchase store refund/revocation notification handling is not implemented.
   Configure and exercise that lifecycle before relying on automatic revocation.
3. **Android:** the existing Pixel 9 Pro emulator booted, but APK replacement
   failed with `INSTALL_FAILED_INSUFFICIENT_STORAGE` (about 420 MB free on its
   6 GB data partition). Cache trimming did not resolve it. Other apps and user
   data were not removed. Android native installation and visual QA remain open.
4. **External services:** live OAuth, production push delivery, real ad payout,
   store refunds, signing/release builds, and store review were not verified.
5. **Scale:** no production load test was performed. Live match state remains
   per-process; see root README/deployment docs for sticky routing and
   cross-node private/friend-match limitations.
6. **Content/season operations:** premium and rank-season behavior needs active
   configured seasons. There was no current ranked season in the local database;
   no live season was invented just to satisfy a test.

Migrations 024 and 025 were applied locally. Production deployment was not
performed. Keep IAP enforcement enabled on every production server.
