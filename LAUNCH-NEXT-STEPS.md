# Launch readiness — 28 September 2026

## Completed in this update

- Fixed missing `/api` prefixes on shop bundle loading/purchase and first-party analytics. An unavailable optional bundle no longer blocks store catalog pricing.
- Added an AST-based regression check covering mobile API path literals, plus live smoke coverage for the style offer and event ingestion.
- Added an isolated, disposable-user REST/concurrent-WebSocket load harness: `npm run test:load:local --prefix server`. Requires the mobile dependencies, development PostgreSQL/Redis and server environment. Set `LOAD_PLAYERS` from 1 to 100. It removes its users and stops its own API process afterward.
- Concurrent synthetic leaderboard reads now share pending computation, without retaining stale results between completed reads.
- Added forced-restart recovery testing to CI and a manually triggered `Check public release endpoints` workflow.

## Verification

124 tests passed with two workers; server typecheck, mobile typecheck/lint, gameplay smoke and forced-restart recovery passed. The first unrestricted test run had two timeouts while other work was active; the isolated rerun passed. An initial gameplay smoke was interrupted during development; the complete rerun passed.

Latest local load sample: 20 connected sockets, 120 REST requests, zero failures, p50 38 ms, p95 84 ms. An initial run exceeded the 800 ms threshold (p95 1677 ms), prompting concurrent leaderboard work sharing. These are local burst samples, not sustained match throughput or a production capacity guarantee.

The release checker failed DNS lookup for the configured `https://api.wordwar.app`. No public deployment or store transaction was performed.

## Owner-dependent launch work

| Priority | What you need to supply or do | Remaining engineering / acceptance check |
| --- | --- | --- |
| Public HTTPS staging | Hosting account/project access and control of the API domain/DNS; keep credentials in the hosting secret manager | Deploy the existing server container with PostgreSQL/Redis, configure TLS, stable NODE_ID and backups, run migrations and the public-endpoint workflow; test a signed preview build |
| Store purchases | App Store Connect and Play Console access, product setup and sandbox/tester accounts | Verify each SKU, cancellation, pending payment, restored purchases, refunds/revocations and retries on both platforms; confirm exact inventory and no duplicate grants |
| Real-device beta | Recruit testers and supply supported iOS/Android devices | Test onboarding, all match modes, background/foreground, phone calls, airplane mode, reconnect, purchases and accessibility; record device/build/result |
| Crash reporting and alerts | Choose/create a crash-reporting project and provide its DSN plus build-service secrets; select alert recipients | Current error capture remains console-only. Integrate the chosen SDK, upload source maps, verify a test crash and configure delivery; do not count reporting as operational until received |
| Sustained capacity and retention | A staging environment and real beta participation | Run full-match concurrency and longer soak tests; review real-player tutorial completion and shop activity separately from fillers; compare repeat sessions and purchases before expanding the economy |

Sentry's official Expo setup reference: https://docs.expo.dev/guides/using-sentry/ . Source-map upload tokens belong in build secrets, never EXPO_PUBLIC variables.

## Device/store acceptance record

For each iOS and Android build, record build number, OS/device, test date and outcome for:

1. Fresh sign-in → playable tutorial → first match → Play Again.
2. Open shop, load localized prices, buy a cosmetic and equip it; reconnect and verify ownership persists.
3. Cancel a store purchase; restore after reinstall; retry interrupted fulfillment without duplicate items.
4. Switch apps, receive a call, disable/re-enable networking and resume the same match.
5. Verify reduced motion, screen-reader tile feedback, account deletion and legal/support links.

Local ports remain API/socket 6011, Metro 8082 and admin 5174. Reload the phone's app to receive the shop fix.
