# WordWar store launch — your part

Updated 2026-11-09 (evening). ✅ = done, ⬜ = still yours to do. I handle
builds, signing, server configuration and submissions.

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
  EAS, first TestFlight build (1.0.0 build 5) uploaded.
- ✅ Google Play: app created, all App content declarations (privacy, sign in
  details with review account, ads, content rating, target audience, data
  safety, advertising ID, health, trader status, government, financial),
  store listing, closed testing release 1.0.0 (3) live to testers, license
  testing, Google-generated app signing.
- ✅ AdMob: both apps, six ad units, rewarded SSV callback verified.
- ✅ Review account for both stores: `~/Downloads/wordwar-play-listing/review-account.txt`.

### Remaining — in the order to do them

#### 1. ⬜ Google Cloud Console: two Android OAuth clients (5 min)
console.cloud.google.com → the WordWar project → APIs & Services →
Credentials → Create credentials → OAuth client ID → type **Android**.
- Client A: name `WordWar Android (Play signing)`, package
  `dev.bonhomieinc.wordwar`, SHA-1
  `E2:51:54:5E:F3:85:4F:D8:77:03:D2:1A:C1:CD:B2:E6:CD:02:13:4E`
- Client B: name `WordWar Android (upload key)`, same package, SHA-1
  `E6:14:7A:AC:EF:C7:31:23:FE:A0:99:B3:05:65:CB:13:CF:28:E9:98`
Send me both client IDs (they end in `.apps.googleusercontent.com`).

#### 2. ⬜ Play Console: API access service account (10 min)
Play Console → Home → **Manage account** → **API access** → link (or create)
a Google Cloud project → **Create new service account** → follow the link to
Cloud Console → create account `play-publisher` → back in Play Console press
**Done** → next to the new account choose **Manage Play Console permissions**
→ grant it to the WordWar app with **Admin (all permissions)** → Invite.
Then in Cloud Console → IAM & Admin → Service accounts → the account →
Keys → Add key → JSON. Save the file to Downloads and tell me its filename.

#### 3. ⬜ Play Console: payments profile, then import the products (15 min)
Monetize with Play → **Get started** → create/select the Google Payments
merchant profile (business name Bonhomie LLC, address, bank for payouts).
When it finishes, Monetize → Products → **In-app products** → **Import** →
`~/Downloads/wordwar-play-listing/in-app-products.csv` (all 16 products,
USD prices, auto-converted). Confirm 16 products show as Active.

#### 4. ⬜ MongoDB Atlas: new password and network access (5 min)
Atlas → Database Access → user `joe` → Edit → Edit password → Autogenerate →
copy → Update user. Then Network Access → Add IP → **Allow access from
anywhere** (0.0.0.0/0). Send me the new password privately. The old one
was pasted in chat, so this matters before real users arrive.

#### 5. ⬜ Hosting decisions (1 min, just say yes/no)
- Render web service → Starter (~$7/mo) so the API never sleeps.
- Render Key Value (Redis) Starter (~$10/mo) instead of the shared `fault`
  one, or a free Upstash Redis.

#### 6. ⬜ App Store Connect: in-app purchases (30 min)
App Store Connect → WordWar Game Live → **In-App Purchases** → "+" for each
row in the table below. Type: *Consumable* or *Non-Consumable* as listed.
Reference name = display name. Product ID exactly as listed. Add a price
(pick the tier matching the USD value), then under App Store Localization
add the display name and a one-line description. Save each; they are
submitted together with the first app version.

#### 7. ⬜ App Store Connect: sandbox tester + App Privacy check (5 min)
Users and Access → Sandbox → "+" → add a tester (any email you can
receive mail at; Apple sends a verification). App Privacy: confirm the
seven data types are answered as in the table I sent (Device ID and
Advertising Data = used for tracking).

#### 8. ⬜ App Store Connect: the 1.0 page (20 min)
Open iOS App 1.0. Paste from `~/Downloads/wordwar-appstore-listing/app-store-text.txt`:
subtitle, promotional text, description, keywords, support URL, copyright,
review notes (plus the review account). Upload screenshots from
`iphone-6.9/` (6.9" iPhone) and `ipad-12.9/` (13" iPad). App Information:
category Games → Word, secondary Puzzle, privacy policy URL. Pricing:
Free, all countries. Age rating questionnaire: no mature content.
Then **TestFlight → Internal Testing → "+"** → add yourself and testers →
the processed build appears there to install via the TestFlight app.

#### 9. Then I do
Flip the server to production (verified purchases, real sign-in keys,
dedicated database), build the `production` profile with the real AdMob
units for both stores, upload to Play Production and App Store, and you
press "Send for review" on each.

## In-app products (identical in both stores)

| Product ID | Type | USD | Display name |
|---|---|---|---|
| `dev.bonhomieinc.wordwar.remove_ads` | Non-consumable | 2.99 | Remove Ads |
| `dev.bonhomieinc.wordwar.battlepass.premium` | Consumable | 4.99 | Premium Battle Pass |
| `dev.bonhomieinc.wordwar.bundle.starter` | Consumable | 2.99 | Starter Bundle |
| `dev.bonhomieinc.wordwar.coins.pebble` | Consumable | 0.99 | 100 Coins |
| `dev.bonhomieinc.wordwar.coins.pocket` | Consumable | 4.99 | 550 Coins |
| `dev.bonhomieinc.wordwar.coins.treasure` | Consumable | 9.99 | 1,200 Coins |
| `dev.bonhomieinc.wordwar.coins.vault` | Consumable | 19.99 | 2,700 Coins |
| `dev.bonhomieinc.wordwar.cosmetic.theme_neon` | Non-consumable | 2.99 | Neon Pulse Theme |
| `dev.bonhomieinc.wordwar.cosmetic.theme_paper` | Non-consumable | 2.99 | Paperback Theme |
| `dev.bonhomieinc.wordwar.cosmetic.theme_obsidian` | Non-consumable | 4.99 | Obsidian Theme |
| `dev.bonhomieinc.wordwar.cosmetic.victory_confetti` | Non-consumable | 3.99 | Confetti Storm |
| `dev.bonhomieinc.wordwar.cosmetic.victory_lightning` | Non-consumable | 7.99 | Lightning |
| `dev.bonhomieinc.wordwar.cosmetic.avatar_fox_01` | Non-consumable | 1.99 | Fox Avatar |
| `dev.bonhomieinc.wordwar.cosmetic.avatar_owl_01` | Non-consumable | 1.99 | Owl Avatar |
| `dev.bonhomieinc.wordwar.cosmetic.nameplate_gold` | Non-consumable | 2.99 | Gold Nameplate |
| `dev.bonhomieinc.wordwar.cosmetic.nameplate_rainbow` | Non-consumable | 5.99 | Spectrum Nameplate |

Play import file: `~/Downloads/wordwar-play-listing/in-app-products.csv`.

## Reference: fingerprints and IDs
- Play app-signing SHA-1: `E2:51:54:5E:F3:85:4F:D8:77:03:D2:1A:C1:CD:B2:E6:CD:02:13:4E`
- EAS upload-key SHA-1: `E6:14:7A:AC:EF:C7:31:23:FE:A0:99:B3:05:65:CB:13:CF:28:E9:98`
- AdMob app + unit IDs: `mobile/eas.json` → build.production.env
- Android bundles in Downloads: `wordwar-1.0.0-3.aab` (live to testers),
  `wordwar-1.0.0-4.aab` (spare)
