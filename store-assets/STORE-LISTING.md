# WordWar — Store Listing & Submission Kit

Everything needed to submit to the **Apple App Store** and **Google Play**.
Generated assets live alongside this file; copy blocks below are paste-ready.

---

## 1. App identity

| Field | Value |
|---|---|
| App name | **WordWar** |
| Subtitle (App Store, ≤30) | **Real-time 1v1 word duels** |
| Short description (Play, ≤80) | **Race a live opponent to crack the same hidden word. Fastest solver wins.** |
| Bundle ID (iOS) | `dev.bonhomieinc.wordwar` |
| Package (Android) | `dev.bonhomieinc.wordwar` |
| Primary category | Games → **Word** |
| Secondary category | Games → Puzzle |
| Content rating | Everyone / 4+ (no objectionable content; user-generated names/words are moderated + reportable) |
| Price | Free (with in-app purchases + ads) |

---

## 2. Keywords (App Store — one field, ≤100 chars)

```
word game,wordle,1v1,multiplayer,word duel,anagram,puzzle,vocabulary,pvp,daily word,brain,spelling
```

Google Play has no keyword field — weave terms into the description naturally.

---

## 3. Promotional text (App Store, ≤170, updatable without review)

```
New season live now. Climb from Stone to Legend, earn power-ups, and challenge friends to real-time word duels.
```

---

## 4. Full description

### Google Play (≤4000 chars) / App Store description

```
Think you’re fast with words? Prove it — live.

WordWar is a real-time 1v1 word game: you and your opponent get the SAME hidden
word and race the same clock. Guess in Wordle-style rows — green means right
letter, right spot; yellow means right letter, wrong spot. You see your rival’s
tile colors update in real time, but never their letters. First to crack it wins.

⚔️ REAL-TIME DUELS
No turn-taking. Both players solve at once while the clock ticks. Read your
opponent’s progress from their colors and outrace them.

🏆 RANKED CLIMB
Win to climb eight tiers — Stone, Bronze, Silver, Gold, Platinum, Diamond,
Master, Legend. Every match moves your Elo. Seasons reset the ladder so anyone
can rise.

🎮 FOUR WAYS TO PLAY
• Classic Ranked — race the same word, 1v1
• Mystery Duel — you each submit a word and crack each other’s
• Daily Challenge — one shared word for the whole world, ranked by guess count
• Friends — private live matches by invite or code

⚡ EARN POWER-UPS (never pay-to-win)
Reveal a letter, Scramble your rival’s view, or Lock their power-ups. All earned
through play — win streaks and daily rewards — never bought.

🎨 MAKE IT YOURS
Unlock board themes, victory animations, avatars, nameplates, and profile
borders. Full color-blind mode with high-contrast tiles.

📈 TRACK EVERYTHING
Win rate, streaks, rank history, and full match replays so you can study how
every duel played out.

Fair by design: the answer never leaves the server, every guess is validated and
scored server-side, and all ranking is computed server-side.

Download WordWar and start your first duel in seconds.
```

---

## 5. What’s New (release notes — first version)

```
The first WordWar release:
• Real-time 1v1 ranked word duels
• Mystery Duel, Daily Challenge, and private Friend matches
• Earned power-ups, eight-tier ranked ladder, and seasons
• Match replays, cosmetics, and full color-blind mode
Jump in and race your first opponent!
```

---

## 6. Assets in this kit

| Asset | File | Spec | Where it goes |
|---|---|---|---|
| App icon (in-app) | `../mobile/assets/icon.png` | 1024² | Already wired in app.json (Expo builds iOS/Android sizes) |
| Android adaptive fg | `../mobile/assets/adaptive-icon.png` | 1024², transparent, on `#0F1115` | app.json |
| Splash | `../mobile/assets/splash-icon.png` | 1024², on `#0F1115` | app.json |
| Web favicon | `../mobile/assets/favicon.png` | 196² | app.json |
| App Store icon | `icons/app-store-icon-1024.png` | 1024², **no alpha** | App Store Connect (usually auto-pulled from build) |
| Play icon | `icons/play-store-icon-512.png` | 512², no alpha | Play Console → Store listing → App icon |
| Play feature graphic | `feature-graphic/play-feature-graphic-1024x500.png` | 1024×500, no alpha | Play Console → Store listing → Feature graphic |
| iPhone 6.9" screenshots ×4 | `ios-screenshots-6.9/*-1320x2868.png` | 1320×2868, no alpha | App Store Connect → **iPhone 6.9"** (primary) |
| iPhone 6.7" screenshots ×4 | `ios-screenshots/*-1290x2796.png` | 1290×2796, no alpha | App Store Connect → iPhone 6.7" (alternate) |
| iPad 13" screenshots ×4 | `ipad-screenshots/*-2064x2752.png` | 2064×2752, no alpha | App Store Connect → **iPad 13"** |
| iPad 12.9" screenshots ×4 | `ipad-screenshots-12.9/*-2048x2732.png` | 2048×2732, no alpha | App Store Connect → iPad 12.9" |
| Android screenshots ×4 | `android-screenshots/*-1080x2160.jpg` | 1080×2160 (2:1), no alpha | Play Console → Phone screenshots |

> Screenshots are high-fidelity design renders that match the shipping UI at the
> exact required pixel sizes — submission-ready, and swappable for on-device
> captures later. Full iPhone (6.9" + 6.7"), iPad (13"), and Android sets are
> included. The iPad set frames the app on a branded backdrop (the app is
> portrait phone-first). 12.9" iPad (2048×2732) is nearly identical if a slot
> asks for it — resize any iPad file with `sips -z 2732 2048`.

---

## 7. Privacy & compliance (both stores)

Everything below is implemented in code; the bullets marked **you** need your
accounts/keys.

- **Privacy Policy / Terms URLs:** served by the API server at
  `https://<your-api-host>/legal/privacy` and `/legal/terms` (rendered from
  `server/legal/*.md`). Paste those URLs in App Store Connect, Play Console,
  and the AdMob console. The app links both from Settings and from the
  welcome/register "By continuing you agree…" line.
- **Account deletion:** in-app at **Profile → Settings → Account → Delete
  account** (Apple 5.1.1(v)) **and** a web page at
  `https://<your-api-host>/legal/delete-account` (Play requires a web link —
  paste it as the "Delete account URL" in the Data safety form). Deleting a
  Sign in with Apple account also revokes the Apple token, as Apple requires —
  **you:** set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` on the
  server (Sign in with Apple key from the developer portal).
- **Support contact:** in-app (Settings → Contact support, login "Forgot
  password?", suspended screen) → `adeyemibabatundejoseph@gmail.com`
  (override with `EXPO_PUBLIC_SUPPORT_EMAIL` / server `SUPPORT_EMAIL`).
- **Login services (Apple 4.8):** Google login is offered, so **Sign in with
  Apple is enabled** (`usesAppleSignIn`, entitlement, runtime availability
  check). **You:** the App ID in the developer portal must have the *Sign in
  with Apple* capability (paid team required).
- **UGC (Apple 1.2):** profanity filter on usernames + Mystery words, in-app
  **Report** and **Block** from the opponent card, blocked-users management in
  Settings, Terms agreement at sign-up, published contact email. ✔
- **Ads:** AdMob banner + interstitial + rewarded. iOS **ATT** prompt before
  init; **UMP consent form** (GDPR/UK + US states) via `AdsConsent.gatherConsent`
  with a Settings → *Privacy options* entry point where required; ad content
  rating capped at **T**. **You:** replace the sample AdMob app ids
  (`ADMOB_IOS_APP_ID` / `ADMOB_ANDROID_APP_ID` at build time) and unit ids
  (`EXPO_PUBLIC_ADMOB_*`) — a production EAS build **fails** if they're missing
  or still Google's samples. Declare "Contains ads" in both stores and set up
  the GDPR/US-state messages in AdMob → Privacy & messaging.
- **In-app purchases:** through StoreKit / Play Billing (`expo-iap`, Play
  Billing Library 8.x). Prices in the UI come from the store (localized). iOS
  transactions are verified server-side from the StoreKit 2 signed JWS (Apple
  root pinned); Android via the Play Developer API. "Restore Purchases" is in
  the shop. Purchases still held by the store are reconciled at every launch.
  **You:** create the products below, then set `IAP_ENFORCE=true` (default in
  production) + `GOOGLE_PLAY_PACKAGE_NAME` + `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

### In-app products to create (ids must match exactly)

| Product id | Type | Reference price | Grants |
|---|---|---|---|
| `dev.bonhomieinc.wordwar.remove_ads` | Non-consumable | $4.99 | Removes banner + interstitial ads |
| `dev.bonhomieinc.wordwar.battlepass.premium` | **Consumable** | $3.99 | Premium track for the current season (re-buyable next season) |
| `dev.bonhomieinc.wordwar.bundle.starter` | Non-consumable | $2.99 | Starter Bundle: 500 coins + Fox avatar + Neon Pulse theme (one per account) |
| `dev.bonhomieinc.wordwar.coins.pebble` | Consumable | $0.99 | 100 coins |
| `dev.bonhomieinc.wordwar.coins.pocket` | Consumable | $4.99 | 550 coins |
| `dev.bonhomieinc.wordwar.coins.treasure` | Consumable | $9.99 | 1,200 coins |
| `dev.bonhomieinc.wordwar.coins.vault` | Consumable | $19.99 | 2,700 coins |
| `dev.bonhomieinc.wordwar.coins.mega` | Consumable | $49.99 | 7,500 coins |
| `dev.bonhomieinc.wordwar.cosmetic.avatar_owl_01` | Non-consumable | $1.99 | Owl avatar |
| `dev.bonhomieinc.wordwar.cosmetic.avatar_fox_01` | Non-consumable | $1.99 | Fox avatar |
| `dev.bonhomieinc.wordwar.cosmetic.theme_paper` | Non-consumable | $2.99 | Paperback board theme |
| `dev.bonhomieinc.wordwar.cosmetic.theme_neon` | Non-consumable | $2.99 | Neon Pulse board theme |
| `dev.bonhomieinc.wordwar.cosmetic.theme_obsidian` | Non-consumable | $4.99 | Obsidian board theme |
| `dev.bonhomieinc.wordwar.cosmetic.nameplate_gold` | Non-consumable | $2.99 | Gold nameplate |
| `dev.bonhomieinc.wordwar.cosmetic.nameplate_rainbow` | Non-consumable | $5.99 | Spectrum nameplate |
| `dev.bonhomieinc.wordwar.cosmetic.victory_confetti` | Non-consumable | $3.99 | Confetti Storm victory animation |
| `dev.bonhomieinc.wordwar.cosmetic.victory_lightning` | Non-consumable | $7.99 | Lightning victory animation |

(Paid cosmetics = every row in the `cosmetics` table with `price_cents > 0`;
add a product whenever you add one. Free cosmetics need no product.)

### Coin economy (no store products needed — these are coin sinks)

Coins come from wins (5), the daily streak (10/day + milestones), the Daily
Bonus ad (30), the **Free coins** rewarded ad (25 × 3/day) and coin packs.
They are spent on: hints (50), **every paid cosmetic** (250–1,100 coins as an
alternative to cash), **Streak Shield** (150, hold 2 — each covers one missed
day), **XP Booster** (250 — 2× battle-pass XP from matches for 24h), and
**username changes** (first free, then 300). Nothing that affects match
fairness is sold: power-ups stay earn-only.

### Data collected (App Privacy label / Play Data Safety)

| Data | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| User ID | yes | yes | no | App functionality |
| Email address | only email/Google/Apple sign-in | yes | no | App functionality (login) |
| Device ID (guest id) | yes | yes | no | App functionality (guest login) |
| Purchase history | yes | yes | no | App functionality (entitlements) |
| Gameplay content (guesses, words, usernames) | yes | yes | no | App functionality |
| Advertising identifier (IDFA / AD_ID) | via AdMob | — | **yes (iOS, after ATT)** | Third-party advertising |
| Coarse location / IP | via AdMob + server logs | no | no | Advertising / analytics, security |
| Crash data | only if Sentry is enabled | no | no | App functionality |

Not collected: contacts, photos, precise location, health, browsing history.
Data can be deleted by the user (in-app + web). Data is encrypted in transit.

**Age rating:** answer the questionnaires honestly for user-generated
usernames/words with moderation + reporting → typically **12+** (Apple,
"Infrequent/Mild … user-generated content") / **Teen** (IARC). Do not select
the Kids category (ads + UGC).

---

## 8. Submission checklist

### Code / config (done in this repo)
- [x] Sign in with Apple enabled (`usesAppleSignIn`, entitlement, runtime check).
- [x] iPad: `requireFullScreen` (portrait-only; avoids ITMS-90474).
- [x] Version `1.0.0`, build 1 (EAS auto-increments remotely).
- [x] iOS privacy manifest (tracking flag + collected data types); ATT prompt.
- [x] UMP consent form + Settings → Privacy options; ad content rating T.
- [x] Terms/Privacy consent line at sign-up; Privacy + Terms + Support in Settings.
- [x] Account deletion in-app + web page; Apple token revocation on delete.
- [x] StoreKit 2 / Play Billing 8 purchases with server verification, restore, launch reconcile, localized prices.
- [x] Unused Android permissions stripped (storage, overlay); AD_ID + BILLING present.
- [x] Production build guard: fails on missing/sample AdMob ids or non-https API URL.
- [x] Push permission asked in context (Friends), not at launch.

### Apple App Store (you)
- [ ] **Paid Apple Developer Program** membership; App ID `dev.bonhomieinc.wordwar` with *Sign in with Apple*, *Push Notifications*, *In-App Purchase* capabilities.
- [ ] Sign in with Apple **key** (.p8) → server `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY`.
- [ ] Create the in-app products above in App Store Connect and attach them to the first version.
- [ ] `eas build --profile production --platform ios` → `eas submit`. Set `EXPO_PUBLIC_API_URL` (real https host), `ADMOB_IOS_APP_ID`, `EXPO_PUBLIC_ADMOB_*_IOS_ID`, `EXPO_PUBLIC_GOOGLE_*` in `eas.json` production env or EAS env vars (`.env` is NOT uploaded).
- [ ] App Store Connect: name, subtitle, promo text, description, keywords, category, **age rating**, App Privacy (table above), Privacy Policy URL (`/legal/privacy`), Support URL/email.
- [ ] Screenshots: **6.9"** (`ios-screenshots-6.9/`), 6.7" alternate, **iPad 13"** (`ipad-screenshots/`). Test on an iPad simulator once (app is portrait full-screen).
- [ ] Review notes: "Tap PLAY NOW to play as a guest — no login needed. Purchases can be tested with a sandbox account."

### Google Play (you)
- [ ] Play Console account; upload key / Play App Signing.
- [ ] `eas build --profile production --platform android` (AAB) → `eas submit`. Same env vars as above (Android ids).
- [ ] Store listing: icon 512 (`icons/`), feature graphic (`feature-graphic/`), phone screenshots (`android-screenshots/`).
- [ ] **Content rating** (IARC) questionnaire; **Ads = Yes**; target audience 13+ (not designed for children).
- [ ] **Data safety** form (table above) + **Delete account URL** = `https://<api-host>/legal/delete-account`; Privacy Policy URL.
- [ ] Create the in-app products above; a Google Cloud service account with the *Android Publisher* role → server `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
- [ ] Push: upload FCM v1 credentials to EAS (`eas credentials`) so Expo push works on Android.
- [ ] Closed testing track first (Play requires 12 testers × 14 days for new personal accounts before production).

### Server (before either store goes live)
- [ ] Host the API over **https** (the app refuses cleartext in production). Run migrations (`npm run migrate`) — includes `020_apple_refresh_token`.
- [ ] `NODE_ENV=production`, real `JWT_SECRET`, locked `CORS_ORIGINS`, `TRUST_PROXY`, `METRICS_TOKEN`.
- [ ] `IAP_ENFORCE=true` (default in production), `APPLE_BUNDLE_ID`, `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, Apple sign-in key vars, `SUPPORT_EMAIL`.
- [ ] AdMob rewarded **SSV callback URL** = `https://<api-host>/api/ads/ssv` on both rewarded units.
- [ ] Managed Postgres + Redis with backups; sticky sessions if >1 node (see `deploy/`).

---

## 9. Notes on the icon

The mark is a glowing neon **W** over a dark field with a word-tile row (green
“correct” + gold “misplaced” tiles) — instantly readable at small sizes and
consistent with the in-app neon theme. Source SVGs are in the scratch folder if
you want tweaks; regenerate with the qlmanage/Chrome pipeline used here.
```
