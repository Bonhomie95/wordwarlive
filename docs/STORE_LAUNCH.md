# WordWar store launch — your part

Updated 2026-11-10. ✅ = done, ⬜ = still yours to do. I handle builds,
signing, server configuration and submissions.

Identifiers:

| What | Value |
|---|---|
| Bundle ID / package | `dev.bonhomieinc.wordwar` |
| API | `https://wordwar-server-1ujy.onrender.com` |
| Privacy policy | `https://wordwar-server-1ujy.onrender.com/legal/privacy` |
| Terms | `https://wordwar-server-1ujy.onrender.com/legal/terms` |
| Delete account | `https://wordwar-server-1ujy.onrender.com/legal/delete-account` |
| Support | `https://wordwar-server-1ujy.onrender.com/legal/support` |
| Rewarded ad SSV callback | `https://wordwar-server-1ujy.onrender.com/api/ads/ssv` |
| App Store Connect app | WordWar Game Live, Apple ID 6832551406 |
| Play app | WordWar, organization account Bonhomie LLC |

## Status

### Done
- ✅ Apple: paid team (Bonhomie LLC, S9XX65426W), Sign in with Apple key on
  the server, Paid Apps agreement + banking, app record, shared secret on
  the server, distribution certificate / provisioning profile / push key on
  EAS, TestFlight build 1.0.0 (5) uploaded, internal TestFlight group.
- ✅ App Store Connect, 1.0.0 page: description, keywords, promotional text,
  support URL, copyright, subtitle, categories (Games: Word + Puzzle),
  screenshots (iPhone 6.9" and iPad 13", 4 each), review notes, content
  rights, age rating, price Free in all 175 countries, privacy policy URL.
- ✅ App Store Connect, App Privacy: published (Device ID and Advertising
  Data marked as used for tracking, matching the ATT prompt).
- ✅ App Store Connect, in-app purchases: all 17 complete (USD price,
  availability, en-US name/description, review screenshot from the shop).
- ✅ Google Play: app created, all App content declarations, store listing,
  closed testing release 1.0.0 (3) live to testers, license testing,
  Google-generated app signing. Full description fixed (no "Wordle", no hard
  line breaks) and queued in Publishing overview; it goes to Google with the
  production release.
- ✅ Google sign-in on Android: Web + two Android OAuth clients, consent
  screen in production, all client IDs on the server.
- ✅ Play Developer API: service account `play-console-api-access` invited
  (Active), JSON key on the server (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`) and
  in `mobile/play-service-account.json` for `eas submit`; all 17 one-time
  products created and active.
- ✅ AdMob: both apps, six ad units, rewarded SSV callback verified.
- ✅ Review account for both stores: `~/Downloads/wordwar-play-listing/review-account.txt`.

### Remaining — in the order to do them

- ✅ 2026-11-10 20:15 UTC: iOS 1.0.0 (build 10, production) and all 17 in-app
  purchases in App Review — "Waiting for Review". Build 9 was rejected
  (ITMS-91064: the privacy manifest said tracking with no tracking domains;
  fixed in app.config.ts). Release is manual: approval publishes nothing.
- ✅ Google Cloud key-creation policy restored; Play payout bank account
  added (Google verification pending).

#### 1. ✅ MongoDB Atlas: password rotated
Done 2026-11-10: the `joe` password was rotated and the new connection
string is on Render (server reconnected, readiness green).

#### 2. ✅ Hosting: free plan kept awake
You kept Render's free plan. The server pings its own public URL every 10
minutes (`server/src/index.ts`, only when `RENDER_EXTERNAL_URL` is set) so App
Review never hits a 50 s cold start; `.github/workflows/keep-awake.yml` is a
backup (GitHub had not run its schedule yet). Before real users arrive,
upgrade the web service to Starter (~$7/mo), move Redis off the shared
`fault` instance, and delete both pings.

#### 3. ⬜ EU Digital Services Act (5 min)
App Store Connect → Business (or App Information) → Digital Services Act →
declare trader status for Bonhomie LLC (address, phone, email). Without it
the app is not offered in EU storefronts.

#### 4. Before you release the approved app
Approval does not publish anything (manual release). Before you press
"Release this version" in App Store Connect:
- I flip the server to production (NODE_ENV=production, verified purchases,
  CORS origin, metrics token) on a dedicated database — needs step 1.
- I build the Android `production` profile and upload it to Play
  Production; you press Publishing overview → Submit changes for review (the
  release plus the queued listing fix).

Optional: the macOS, tvOS and visionOS 1.0 drafts in App Store Connect are
unused (WordWar is iPhone/iPad only). They forced the Apple TV privacy-policy
text I added; they can be deleted from App Store Connect if you prefer.

## In-app products (identical in both stores)

| Product ID | Type | USD | Display name |
|---|---|---|---|
| `dev.bonhomieinc.wordwar.remove_ads` | Non-consumable | 4.99 | Remove Ads |
| `dev.bonhomieinc.wordwar.battlepass.premium` | Consumable | 3.99 | Premium Battle Pass |
| `dev.bonhomieinc.wordwar.bundle.starter` | Consumable | 2.99 | Starter Bundle |
| `dev.bonhomieinc.wordwar.coins.pebble` | Consumable | 0.99 | 100 Coins |
| `dev.bonhomieinc.wordwar.coins.pocket` | Consumable | 4.99 | 550 Coins |
| `dev.bonhomieinc.wordwar.coins.treasure` | Consumable | 9.99 | 1,200 Coins |
| `dev.bonhomieinc.wordwar.coins.vault` | Consumable | 19.99 | 2,700 Coins |
| `dev.bonhomieinc.wordwar.coins.mega` | Consumable | 49.99 | 7,500 Coins |
| `dev.bonhomieinc.wordwar.cosmetic.theme_neon` | Non-consumable | 2.99 | Neon Pulse Theme |
| `dev.bonhomieinc.wordwar.cosmetic.theme_paper` | Non-consumable | 2.99 | Paperback Theme |
| `dev.bonhomieinc.wordwar.cosmetic.theme_obsidian` | Non-consumable | 4.99 | Obsidian Theme |
| `dev.bonhomieinc.wordwar.cosmetic.victory_confetti` | Non-consumable | 3.99 | Confetti Storm |
| `dev.bonhomieinc.wordwar.cosmetic.victory_lightning` | Non-consumable | 7.99 | Lightning |
| `dev.bonhomieinc.wordwar.cosmetic.avatar_fox_01` | Non-consumable | 1.99 | Fox Avatar |
| `dev.bonhomieinc.wordwar.cosmetic.avatar_owl_01` | Non-consumable | 1.99 | Owl Avatar |
| `dev.bonhomieinc.wordwar.cosmetic.nameplate_gold` | Non-consumable | 2.99 | Gold Nameplate |
| `dev.bonhomieinc.wordwar.cosmetic.nameplate_rainbow` | Non-consumable | 5.99 | Spectrum Nameplate |

Both stores already have all 17 (Play: created through the Play Developer API on 2026-11-10; the CSV in `~/Downloads/wordwar-play-listing/` is no longer needed).

## Reference: fingerprints and IDs
- Play app-signing SHA-1: `E2:51:54:5E:F3:85:4F:D8:77:03:D2:1A:C1:CD:B2:E6:CD:02:13:4E`
- EAS upload-key SHA-1: `E6:14:7A:AC:EF:C7:31:23:FE:A0:99:B3:05:65:CB:13:CF:28:E9:98`
- AdMob app + unit IDs: `mobile/eas.json` → build.production.env
- Android bundles in Downloads: `wordwar-1.0.0-3.aab` (live to testers),
  `wordwar-1.0.0-4.aab` (spare)
