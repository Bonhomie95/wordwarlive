# WordWar store launch — your part

Updated 2026-11-11. ✅ = done, ⬜ = still yours to do. I handle builds,
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
  the server, banking for the Paid Apps agreement (the agreement goes active
  after the tax form, step 3), app record, shared secret on
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

- ✅ 2026-11-11: **iOS 1.0.0 released** (build 12, all 17 in-app purchases
  approved) — "Ready for Distribution". Apple says the store page can take up
  to 24 h to appear. Purchases stay unavailable to players until the Paid Apps
  agreement is active (step 3); the free game works fully.
- ✅ 2026-11-12 11:55 UTC: **iOS 1.0.1** (build 13) in App Review — the same
  app with: the Marketing URL https://bonhomieinc.dev (where AdMob looks for
  app-ads.txt on iOS), the new store name **"WordWar: 1v1 Word Game"**
  (was "WordWar Game Live"), the subtitle "Race a live rival to the word" and
  keywords without words already in the name/subtitle. The home-screen name
  stays "WordWar". Release is manual: press "Release this version" when Apple
  approves it. Google Play keeps the title "WordWar" until Google finishes its
  first review; then I'll rename it to match.
- ✅ 2026-11-14: **Both apps are live.** Google Play:
  https://play.google.com/store/apps/details?id=dev.bonhomieinc.wordwar —
  App Store: https://apps.apple.com/us/app/id6832551406 (1.0.1 released; the
  public page switches to the new name within ~24 h).
- ✅ 2026-11-14 AdMob: Android linked and verified (app-ads.txt found through
  the Play website) — AdMob review 2–3 days, then "Limited ad serving" lifts.
  iOS linked to the App Store listing (search the full US App Store URL); its
  app-ads.txt check ("Verify app" in AdMob → WordWar iOS → App settings) works
  once Apple's public data shows 1.0.1 with the Marketing URL.
- ✅ 2026-11-14 Availability: iOS app and all 17 purchases on sale in all 175
  App Store countries (new countries auto-added); Play app in all 177
  countries + rest of world, all 17 products active in all 174 billing
  regions (new regions auto-added).
- ✅ 2026-11-14 AdMob → Privacy & messaging: "WordWar US states" (opt-out of
  sale/sharing, US states with privacy laws) and "WordWar ATT explainer"
  (iOS, neutral wording: "Either choice is fine") published.
- ✅ 2026-11-14 App Store promotional text: "Race a live opponent to the hidden
  word. Fast 1v1 matches, daily challenges and season rewards. Free to play!"
- ⬜ iOS 1.0.2 (build 14): Google consent runs before Apple's tracking prompt so
  the ATT explainer can show (more players allow tracking → better-paying
  ads). Submitted for review once build 14 is processed; press Release when
  approved.
- ⬜ AdMob → Payments → Settings: **United States tax info is empty** — add it
  (yours to do) or Google can hold/withhold ad payouts.
- ✅ 2026-11-14 AdMob → Privacy & messaging → European regulations: message
  "WordWar EU consent" **published** for both WordWar apps (English; buttons
  Consent / Do not consent / Manage options; privacy policy
  https://wordwar-server-1ujy.onrender.com/legal/privacy; Google's 199 common
  ad partners). Players in the EEA, UK and Switzerland see it on first launch
  (it can take up to an hour to start showing); Settings → "Privacy options"
  reopens it.
- ⬜ 2026-11-14: Android 1.0.1 (Block & leave fix) building → Play production;
  Play title renamed to "WordWar: 1v1 Word Game". Both go to Google review and
  then wait for Publish (managed publishing).
- ✅ 2026-11-12 11:55 UTC: **iOS 1.0.1** (build 13) in App Review — the same
  app with: the Marketing URL https://bonhomieinc.dev (where AdMob looks for
  app-ads.txt on iOS), the new store name **"WordWar: 1v1 Word Game"**
  (was "WordWar Game Live"), the subtitle "Race a live rival to the word" and
  keywords without words already in the name/subtitle. The home-screen name
  stays "WordWar". Release is manual: press "Release this version" when Apple
  approves it. Google Play keeps the title "WordWar" until Google finishes its
  first review; then I'll rename it to match.
- ⬜ 2026-11-14: **Google approved Android 1.0.0 (6)** and the description fix.
  Both wait under Publishing overview → "Changes ready to publish" until you
  press **Publish**:
  https://play.google.com/console/developers/4852878029712266831/app/4974758962474734649/publishing
- ⬜ 2026-11-14: **Apple approved iOS 1.0.1** (new name, Marketing URL) —
  "Pending Developer Release". Press **Release this version**:
  https://appstoreconnect.apple.com/apps/6832551406/distribution/ios/version/inflight
- ✅ 2026-11-14: AdMob iOS app linked to the App Store listing (found by
  searching the full US App Store URL; the store ID and name searches didn't
  find it). app-ads.txt verification fails until 1.0.1 is live, because 1.0.0
  has no Marketing URL; then AdMob → Apps → WordWar iOS → Check for updates.
  Android gets linked after you press Publish on Play.
- ✅ 2026-11-11 07:36 UTC: iOS 1.0.0 resubmitted with build 12 and all 17
  in-app purchases — "Waiting for Review". Apple had paused it at 05:06 UTC
  (Guideline 2.1 "Information Needed", no bug found) and asked for written
  answers plus a screen recording; both are now in App Review Information.
  Build 12 adds: blocking your opponent leaves the match, the Apple button no
  longer spins the Google one, a reinstall starts fresh (practice word,
  signed out). The recording shows everything Apple listed except a
  purchase, which can't work until the Paid Apps agreement is active (step
  3). If Apple asks again, record a short clip of a Shop purchase once the
  agreement shows Active.
- ✅ 2026-11-10 21:57 UTC: iOS 1.0.0 (build 11, production) and all 17 in-app
  purchases in App Review — "Waiting for Review". Build 11 replaced build 10
  (practice round now uses the game keyboard; friendlier no-ad messages).
  Build 9 was rejected (ITMS-91064: the privacy manifest said tracking with
  no tracking domains; fixed in app.config.ts). Release is manual: approval
  publishes nothing.
- ✅ 2026-11-10 22:27 UTC: Android 1.0.0 (6) on the Play **Production** track
  (`eas submit --profile play-production`), sent to Google review
  automatically after the quick checks. The fixed full description is
  approved and waits under "Changes ready to publish". Managed publishing is
  on, so nothing goes live until you press Publish.
- ✅ Google Cloud key-creation policy restored; Play payout bank account
  verified. Apple bank account (UK, GBP) added — "Processing" for up to 24 h.

#### 1. ✅ MongoDB Atlas: password rotated
Done 2026-11-10: the `joe` password was rotated and the new connection
string is on Render (server reconnected, readiness green).

#### 2. ✅ Hosting: free plan kept awake
You kept Render's free plan. The server pings its own public URL every 10
minutes (`server/src/index.ts`, only when `RENDER_EXTERNAL_URL` is set) so App
Review never hits a 50 s cold start; `.github/workflows/keep-awake.yml` is a
backup (GitHub had not run its schedule yet). Before real users arrive,
upgrade the web service to Starter (~$7/mo), move Redis off the shared
`fault` instance, delete both pings, and confirm `TRUST_PROXY=1` gives each
player their own rate-limit bucket (Render sits behind Cloudflare; the hop
count isn't documented).

#### 3. ⬜ Tax form → Paid Apps agreement
App Store Connect → Business → Tax forms: W-8BEN (foreign owner of a
single-member LLC). In-app purchases can't be bought, even in TestFlight
sandbox, until the Paid Apps agreement is active.

#### 4. ✅ Cloudflare: crawlers can read app-ads.txt
`https://bonhomieinc.dev/app-ads.txt` returns 200 with all three publisher
lines (the "Skip App Ads" rule now also skips Security Level). AdMob checks
it once the apps are live: Android uses the Play listing website
(bonhomieinc.dev); iOS needs the App Store Marketing URL set to
https://bonhomieinc.dev in the next version.

#### 5. ✅ EU Digital Services Act
Trader status is Active for all 27 EU countries (App Store Connect →
Business → Compliance, 2026-11-10).

#### 6. Before you release the approved apps
Approval publishes nothing on either store. Before you press "Release this
version" (App Store Connect) or Publishing overview → Publish (Play):
- ⬜ You make one TestFlight sandbox purchase (needs step 3). The server now
  verifies every purchase with Apple/Google, so this proves the whole path.
- ✅ 2026-11-11 03:41 UTC: server switched to production (NODE_ENV=production,
  verified purchases, CORS limited to the admin panel, metrics token — it's in
  Render → wordwar-server → Environment, TRUST_PROXY=1). Smoke-tested: guest
  sign-in works, receipt-less and fake purchases are refused.

#### 7. ⬜ Right after release: link the stores in AdMob
AdMob shows both WordWar apps as "Requires review — Limited ad serving: Add
store to lift limit". AdMob → Apps → Add store can only find the app once its
store page is public (searching `dev.bonhomieinc.wordwar` finds nothing yet).
After linking, AdMob reviews the app (usually a few days), lifts the limit
and starts reading app-ads.txt (already live). I can do the linking.

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
