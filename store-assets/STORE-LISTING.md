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

- **Privacy Policy URL:** host `PRIVACY.md` publicly (e.g. GitHub Pages) and paste the URL. Required by both stores.
- **Terms of Service URL:** host `TERMS.md` publicly. Required by Play for apps with purchases; recommended for App Store.
- **Support URL / email:** `adeyemibabatundejoseph@gmail.com`.
- **Account deletion:** in-app at **Settings → Account → Delete account** (Apple + Play both require this for apps with accounts) — already implemented.
- **Data collected (for App Privacy label / Play Data Safety):**
  - Identifiers: device ID (guest play), user ID.
  - Contact: email (only if the user signs up with email/Google/Apple).
  - Purchases: IAP transaction history.
  - Usage/Diagnostics: crash + performance data (if Sentry enabled).
  - **Not** collected: location, contacts, photos, health, browsing history.
  - Data is used for app functionality, not tracking. Ads use AdMob — declare AdMob’s data collection per Google’s guidance and complete the **ATT** prompt on iOS (already configured).
- **Ads:** app shows banner + rewarded + interstitial ads (AdMob). Declare ads in both stores. Provide a “remove ads” IAP (implemented).
- **In-app purchases:** coins, cosmetics, battle-pass premium, remove-ads. List them in App Store Connect / Play Console and set `IAP_ENFORCE=true` server-side before going live (see `DEPLOYMENT.md`).

---

## 8. Submission checklist

### Apple App Store
- [ ] **Paid Apple Developer Program** membership active (required for release + Sign In with Apple).
- [ ] Re-enable Sign In with Apple: set `ios.usesAppleSignIn: true` in `app.json` and restore the `com.apple.developer.applesignin` entitlement (removed for free-team local testing).
- [ ] Bundle ID `dev.bonhomieinc.wordwar` registered to your team; App ID created with Sign In with Apple + Push (if used) + In-App Purchase capabilities.
- [ ] Build & upload via EAS: `eas build --profile production --platform ios` → `eas submit --profile production --platform ios`.
- [ ] App Store Connect: name, subtitle, promo text, description, keywords, category, age rating questionnaire.
- [ ] Upload **6.9" screenshots** (`ios-screenshots-6.9/`) — the primary iPhone slot; 6.7" (`ios-screenshots/`) as the alternate. Icon is pulled from the build.
- [ ] Upload **iPad 13" screenshots** (`ipad-screenshots/`). iPad support is now enabled (`supportsTablet: true`) — **test the app on an iPad** (it's portrait phone-first) before submitting so the review build matches the screenshots.
- [ ] App Privacy questionnaire (section 7). ATT usage string is set.
- [ ] Privacy Policy + Support URLs.
- [ ] In-App Purchases created + submitted with the build.
- [ ] Sign-in demo account for review (or note that guest “Play Now” needs no login).

### Google Play
- [ ] Play Console developer account ($25 one-time) active.
- [ ] Build & upload AAB: `eas build --profile production --platform android` → `eas submit --profile production --platform android`.
- [ ] Store listing: name, short + full description, **app icon 512** (`icons/`), **feature graphic** (`feature-graphic/`), **phone screenshots** (`android-screenshots/`).
- [ ] Content rating questionnaire (IARC).
- [ ] Data Safety form (section 7).
- [ ] Ads declaration = Yes. Target audience + content.
- [ ] Privacy Policy URL.
- [ ] In-app products created; closed testing track before production is recommended.

### Server (before either store goes live)
- [ ] `NODE_ENV=production`, locked `CORS_ORIGINS`, `TRUST_PROXY`, real `JWT_SECRET`.
- [ ] `IAP_ENFORCE=true` + Apple shared secret + Google Play service account (see `DEPLOYMENT.md`).
- [ ] Managed Postgres + Redis, backups/PITR, sticky-session LB if >1 node (see `deploy/`).
- [ ] AdMob production ad-unit IDs in the mobile env (replace test IDs).

---

## 9. Notes on the icon

The mark is a glowing neon **W** over a dark field with a word-tile row (green
“correct” + gold “misplaced” tiles) — instantly readable at small sizes and
consistent with the in-app neon theme. Source SVGs are in the scratch folder if
you want tweaks; regenerate with the qlmanage/Chrome pipeline used here.
```
