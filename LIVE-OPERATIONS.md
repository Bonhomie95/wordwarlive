# WordWar live operations — 2026-09-27

## Synthetic activity

Admin → Synthetic activity controls the population ceiling, Daily/ranked arrival intervals, per-player ranked daily cap, difficulty and real-participation target. Only super-admins can change these settings; each change requires a reason and creates an audit entry.

Settings take effect the next UTC day. A day is materialized once into PostgreSQL with its configuration and algorithm version. Player identities are persisted independently. Existing daily schedules and published scores are not recalculated when tuning changes. Existing baseline history has been backfilled from the prior generator.

Emergency pause preserves every completed result and cancels the remaining scheduled results. It also prevents new fallback match opponents; live matches finish normally. Resuming enables fallback matchmaking immediately and new leaderboard schedules from the next UTC day. The current day's cancelled activity does not suddenly catch up.

The next day's filler population is `floor(population ceiling × max(0, 1 − real active players / target))`. Activity counts exclude internal bot accounts and banned users. Real participation uses the current and previous UTC activity dates, sampled when a day is created. Historical participants remain on historical boards even when future filler activity reaches zero. Classic fallback waiting time also increases as real participation grows.

## Recovery

An active match's targets, guesses, reveals, hint usage, lock expiry and terminal intent are stored in PostgreSQL. Timer handles and socket IDs are excluded. Recovery runs before the server accepts traffic. Targets remain server-only.

Use a unique **stable NODE_ID** for each server instance and sticky routing. A PostgreSQL advisory lock prevents simultaneous instances from owning the same node. Hostname is the development fallback. Recovery is for restarting that logical node, not automatic migration to an unrelated node. The database must survive the app-server restart. Allow at least two pool connections because ownership retains one connection.

Match time continues during an outage. An expired match settles from its saved guesses. A returning app refreshes match state on reconnect and foregrounding, including discovering a match after a cold app start.

Settlement writes all ranks, coins, XP, streaks, leaderboard entries, match/replay history and the ended checkpoint in one transaction. Terminal intent is saved first; a failed settlement rolls back and retries. `match_over` is emitted only after commit. Completed checkpoints are retained up to seven days and are removed with either player's account.

## Support

Search for a player, open their dossier and use Player timeline. Search covers matches, verified/unverified purchase records, coin activity, cosmetic acquisitions, inventory/equipment changes and moderation actions. The view returns the latest 100 matching events. Inventory history starts with this migration; it cannot reconstruct unlogged historical changes.

Every account mutation requires a 3–500 character reason. Role changes and privileged account controls retain their existing super-admin restrictions. Purchase tokens, password hashes and account credentials are not included in the timeline.

## Onboarding and offers

First launch now offers a local playable practice word with tile symbols, a practice Reveal and explanations of power-up costs. It consumes no inventory or rank. Reopen it from Settings. Tile flips and the tutorial modal respect Reduce Motion. Post-game uses “Play Again” for its next-match action.

The Neon Fox style set combines the existing Fox avatar and Neon Pulse board at 20% off their coin prices. Only missing items are charged. The purchase is atomic, verifies the quoted price and rejects repeat charging. It introduces no new paid power-up or external payment method. Purchased styles are equipped through My items. The existing no-ads offer explicitly retains optional rewarded ads.

Admin → Product uptake shows the last 30 days of first-party shop/tutorial events and store-verified transaction counts. Synthetic accounts are excluded. Client purchase-completion events are interest/funnel signals, not authoritative revenue. Verified purchase counts are gross counts, not refund-adjusted revenue. Privacy text describes the new first-party data collection; account deletion removes the event records.

## Validation

- Server type check and 118 automated tests passed, including configuration limits, automatic tapering, frozen history, emergency-pause boundaries, support history, required reasons, duplicate bundle protection and atomic settlement rollback.
- Live gameplay/API smoke passed across all 12 boards, private and Mystery matches, power-ups, reconnect and moderation.
- A disposable server was actually killed with SIGKILL and restarted: match ID, guesses, reveals, hint cap and inventory survived. A second restart did not repeat settlement.
- Admin production build passed. Synthetic controls and product metrics were inspected in the browser.
- Mobile TypeScript and lint checks passed. Native UI automation was blocked by simulator controls not responding; the updated tutorial still needs a device visual pass.

Before release, use real iOS/Android devices to test app switching and incoming calls both shorter and longer than the 60-second reconnect grace period, Wi-Fi/mobile-data handover, cold launch, reduced motion and screen readers. Confirm sandbox store purchase/cancellation/restoration separately. These physical-device and store outcomes are not claimed as tested here.

For a closed beta, track tutorial completion, unique shop visitors, offer attempts and verified buyers. Compare cosmetic/no-ads uptake with retention and player feedback before changing prices. Real-player demand has not yet been measured; instrumentation is ready to collect it.

## Local commands and ports

`npm run migrate --prefix server`

`npm run test:integration --prefix server`

`npm run test:recovery --prefix server`

`npm run test:smoke --prefix server`

API/socket: **6011** · mobile Metro: **8082** · admin: **5174**.

### Physical-phone connection

Use the computer's LAN address for the API (`http://192.168.8.145:6011` on the current network) and keep the phone on the same network. A shell `EXPO_PUBLIC_API_URL` overrides `mobile/.env`; restart Metro after editing the environment. From `mobile`, start with `env -u EXPO_PUBLIC_API_URL npx expo start --dev-client --lan --port 8082 --clear`, then reload the phone's development build. Development API loopback addresses now resolve to Metro's host while retaining the API port; explicit remote URLs and release builds remain unchanged. The development console prints `[api] endpoint` for diagnosis.

Verified after the connection fix: LAN readiness, authenticated REST and WebSocket connections, five endpoint-resolution regression tests, mobile TypeScript and lint. These checks ran from the computer; the physical phone must reload to receive the corrected bundle.
