# WordWar store launch guide

Last updated 2026-11-09. Everything in **Part A** is yours to do in the Apple,
Google, AdMob, Atlas and Render consoles. Everything in **Part B** I do once
you send me the values from Part A. Part C is the submission itself.

Identifiers used everywhere:

| What | Value |
|---|---|
| Bundle ID / package | `dev.bonhomieinc.wordwar` |
| API (current) | `https://wordwar-server-1ujy.onrender.com` |
| Privacy policy | `https://wordwar-server-1ujy.onrender.com/legal/privacy` |
| Terms | `https://wordwar-server-1ujy.onrender.com/legal/terms` |
| Delete account page | `https://wordwar-server-1ujy.onrender.com/legal/delete-account` |
| Rewarded ad SSV URL | `https://wordwar-server-1ujy.onrender.com/api/ads/ssv` |
| IAP product IDs | listed in A5 below |

If you buy a domain later (for example `api.wordwar.app`), tell me and I'll
move the API and update the links. The Render URL works for the stores.

---

## Part A — your part

### A1. Expo (EAS) account
1. Create a free account at https://expo.dev if you don't have one.
2. In a terminal, in `mobile/`: `npx eas login`, then `npx eas init` and
   accept creating the project. This writes `extra.eas.projectId` into
   `app.json` (needed for push notifications). Commit that change or tell me
   and I will.

### A2. Apple Developer (paid team)
1. **Identifiers → App IDs**: register `dev.bonhomieinc.wordwar` with
   capabilities **Sign In with Apple**, **Push Notifications**,
   **In-App Purchase**.
2. **Keys → create a key** with *Sign in with Apple* enabled. Download the
   `.p8` once. Send me: the **Key ID**, your **Team ID** (top right of the
   developer portal), and the `.p8` file contents. These go on the server so
   Apple tokens can be revoked when a user deletes their account (Apple
   requires it).
3. **Keys → create an APNs key** (or let EAS create it in A6). Push is
   optional for launch but the capability must be on the App ID.
4. **App Store Connect → My Apps → New App**: platform iOS, name *WordWar*,
   bundle ID from step 1, SKU `wordwar-ios`. Note the numeric **Apple ID**
   of the app (App Information page); send it to me for `eas.json`.
5. **App Information → App-Specific Shared Secret**: generate it and send it
   to me (fallback receipt verification).
6. **Agreements, Tax, and Banking**: accept the *Paid Applications* agreement
   and complete banking/tax, or IAP products cannot go live.
7. **In-App Purchases**: create the products in A5 with exactly those IDs.
8. **App Privacy**: answer the questionnaire. We collect: user ID, email
   (optional accounts), device ID (for ads), purchase history, gameplay
   content, and we use the advertising identifier for **tracking** (AdMob).
   Linked to the user: user ID, email, purchases, gameplay. Used for
   tracking: device ID / advertising ID.
9. **Age rating**: no objectionable content; "Unrestricted Web Access" = No;
   in-app purchases = Yes; ads = Yes. Expect 4+ or 9+.
10. **Sandbox tester**: Users and Access → Sandbox → add a tester Apple ID so
    purchases can be tested on TestFlight.

### A3. Google Play Console
1. **Create app**: name *WordWar*, game, free, with ads, with in-app purchases.
2. **App integrity → App signing**: use *Google-generated key*. Copy the
   **SHA-1 of the App signing key** (and later the upload key SHA-1 shown
   after the first EAS build). Send both to me.
3. **Monetize → Products → In-app products**: create the products in A5.
4. **Setup → API access**: link a Google Cloud project, create a **service
   account**, grant it *Finance* and *View app information* permissions on
   the app, then create a **JSON key** for it. Send me the JSON file (it is
   a secret; share it privately, not in a public channel). The server uses it
   to verify Android purchases.
5. **Policy → App content**: Privacy policy URL (table above), ads = Yes,
   **Data safety** form (same answers as A2.8, plus "Advertising ID"
   collected, shared with AdMob), target audience 13+, **Account deletion
   URL** = the delete-account URL above, content rating questionnaire.
6. **Testing**: Google requires a *closed test* with at least 12 testers for
   14 days before a new personal developer account can publish to
   production. Create a closed testing track and an email list now, so the
   14 days start as early as possible.
7. **License testing** (Setup → License testing): add your Gmail so you can
   test purchases without being charged.

### A4. Google Sign-In (Google Cloud Console → Credentials)
You already have a Web, iOS and Android OAuth client in the WordWar project.
For the Play build to sign in with Google, add **one more Android OAuth
client** for package `dev.bonhomieinc.wordwar` with the **Play App signing
SHA-1** from A3.2, and another with the **EAS upload key SHA-1**. Send me all
Android client IDs; I add them to the server's allowed list.

### A5. In-app products (same IDs in both stores)
Create every row below in App Store Connect and in Play Console. The IDs
must match exactly; prices are the catalog prices the app displays.

| Product ID | Type | Price (USD) | What it is |
|---|---|---|---|
| `dev.bonhomieinc.wordwar.remove_ads` | Non-consumable | 2.99 | Remove ads |
| `dev.bonhomieinc.wordwar.battlepass.premium` | Consumable | 4.99 | Premium battle pass (one per season) |
| `dev.bonhomieinc.wordwar.bundle.starter` | Consumable | 2.99 | Starter bundle: 500 coins + Fox avatar + Neon Pulse theme |
| `dev.bonhomieinc.wordwar.coins.pebble` | Consumable | 0.99 | 100 coins |
| `dev.bonhomieinc.wordwar.coins.pocket` | Consumable | 4.99 | 550 coins |
| `dev.bonhomieinc.wordwar.coins.treasure` | Consumable | 9.99 | 1,200 coins |
| `dev.bonhomieinc.wordwar.coins.vault` | Consumable | 19.99 | 2,700 coins |
| `dev.bonhomieinc.wordwar.cosmetic.theme_neon` | Non-consumable | 2.99 | Neon Pulse board theme |
| `dev.bonhomieinc.wordwar.cosmetic.theme_paper` | Non-consumable | 2.99 | Paperback board theme |
| `dev.bonhomieinc.wordwar.cosmetic.theme_obsidian` | Non-consumable | 4.99 | Obsidian board theme |
| `dev.bonhomieinc.wordwar.cosmetic.victory_confetti` | Non-consumable | 3.99 | Confetti Storm victory animation |
| `dev.bonhomieinc.wordwar.cosmetic.victory_lightning` | Non-consumable | 7.99 | Lightning victory animation |
| `dev.bonhomieinc.wordwar.cosmetic.avatar_fox_01` | Non-consumable | 1.99 | Fox avatar |
| `dev.bonhomieinc.wordwar.cosmetic.avatar_owl_01` | Non-consumable | 1.99 | Owl avatar |
| `dev.bonhomieinc.wordwar.cosmetic.nameplate_gold` | Non-consumable | 2.99 | Gold nameplate |
| `dev.bonhomieinc.wordwar.cosmetic.nameplate_rainbow` | Non-consumable | 5.99 | Spectrum nameplate |

Apple: pick the price tier closest to each USD price. Google: enter the USD
price and let Play convert. Both stores need a display name and a
description per product; the "What it is" column works for both.

### A6. AdMob
1. **Apps → Add app** for iOS and for Android (link to the store listings
   once they exist). Send me the two **App IDs** (`ca-app-pub-…~…`).
2. **Ad units**: create Banner, Interstitial and Rewarded for each platform.
   Send me the six unit IDs.
3. On each **Rewarded** unit: Advanced settings → *Server-side verification*
   → callback URL = the SSV URL in the table above.
4. **app-ads.txt**: AdMob will ask for it once the store listings have a
   developer website. If you have no website, leave the "developer website"
   field in both stores empty for now.
5. Payment profile and identity verification in AdMob, or ads won't serve
   for real.

### A7. Database and hosting (money decisions)
The current setup is a free Render web service that sleeps after 15 minutes,
sharing another project's free Redis, on a free Atlas cluster. For launch I
recommend, and need your OK for each:
1. **Render web service → Starter plan** (about $7/month): no sleeping, so
   the first player of the day doesn't wait 50 seconds.
2. **Render Key Value (Redis) → own instance** (Starter, about $10/month) or a
   free Upstash Redis: the shared `fault` Redis is fine for testing only.
3. **MongoDB Atlas**: a dedicated database name `wordwar_prod` (free), and
   ideally the **M2 or M10** cluster tier (from about $9/month) for backups.
   Also **rotate the `joe` database password** (it was pasted in chat) and
   send me the new connection string privately.
4. Atlas **Network Access** must allow Render: either `0.0.0.0/0` (simplest)
   or Render's static outbound IPs from the service's *Connect* tab.

### A8. Store listing assets
- App icon is done. Screenshots: 6.7" and 6.5" iPhone, 12.9" iPad (because
  the app supports iPad), and phone + 7" tablet for Play. Take them from the
  simulator on the Mongo server; tell me and I'll capture a full set.
- Short description (80 chars), full description, keywords, support email,
  marketing URL (optional).

---

## Part B — my part (after you send the values)

Send me, privately: Apple Team ID, Sign-in key ID + `.p8`, App Store app ID,
shared secret, Play service-account JSON, Play SHA-1s, new Android OAuth
client IDs, AdMob app IDs + six unit IDs, new Atlas connection string, and
your yes/no on A7.

Then I will:
1. Put the server into production mode on Render: `NODE_ENV=production`,
   `IAP_ENFORCE=true`, Apple and Google Play credentials, `GOOGLE_CLIENT_IDS`,
   a dedicated `MONGODB_URL`, `REDIS_URL`, `METRICS_TOKEN`, `CORS_ORIGINS`
   (admin dashboard origin), `TRUST_PROXY=1`, `ADMIN_EMAILS` = your email.
   The server refuses to boot if any of these is missing, by design.
2. Set the EAS production environment variables (AdMob app IDs and units,
   Google client IDs, API URL) and fill `eas.json` submit config.
3. Deploy the admin dashboard as a Render static site pointed at the API.
4. Run the `Check public release endpoints` workflow against the API.
5. Build with `eas build --profile production --platform all`, and submit
   with `eas submit`. EAS creates the distribution certificate, provisioning
   profile with Sign in with Apple + Push, and the Play upload key for you.
6. Walk you through TestFlight and the Play closed test, including sandbox
   purchases of every product and a restore-purchases check.

---

## Part C — what reviewers will check
- Sign in with Apple works (required because Google sign-in is offered).
- Account deletion in Profile → Delete account, and the hosted delete page.
- Purchases restore after reinstall.
- Ads: the UMP consent flow appears in the EU; the ATT prompt appears on iOS
  before personalised ads.
- Terms disclose computer-generated players on Ranks and Daily boards
  (already in §4 of the Terms).
- Provide a **demo account** in App Review notes: an email/password account
  I'll create on the production database before submission.
