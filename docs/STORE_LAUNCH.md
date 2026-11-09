# WordWar store launch — your part

Updated 2026-11-09. Only the steps that need your logins are listed. I handle
builds, signing, server configuration and submission.

Identifiers:

| What | Value |
|---|---|
| Bundle ID / package | `dev.bonhomieinc.wordwar` |
| API | `https://wordwar-server-1ujy.onrender.com` |
| Privacy policy | `https://wordwar-server-1ujy.onrender.com/legal/privacy` |
| Terms | `https://wordwar-server-1ujy.onrender.com/legal/terms` |
| Delete account | `https://wordwar-server-1ujy.onrender.com/legal/delete-account` |
| Rewarded ad SSV callback | `https://wordwar-server-1ujy.onrender.com/api/ads/ssv` |

## 1. Apple (developer.apple.com and App Store Connect)

1. **Sign in with Apple key.** Certificates, Identifiers & Profiles → Keys →
   "+" → name `WordWar Sign in` → tick *Sign in with Apple* → Configure →
   primary App ID `dev.bonhomieinc.wordwar` → Register → Download the `.p8`.
   Send me the **Key ID** and the `.p8` file (privately). Your **Team ID** is
   shown top right of that page; send it too.
2. **Agreements, Tax, and Banking** in App Store Connect: accept the *Paid
   Apps* agreement and complete banking and tax. Without it, purchases can't
   be tested or sold.
3. **Shared secret.** App Store Connect → the WordWar app (I create it during
   the first submit) → App Information → *App-Specific Shared Secret* →
   Generate → send it to me.
4. **In-app purchases.** In the WordWar app → In-App Purchases → create each
   row in section 4. Submit them with the first build for review.
5. **App Privacy** questionnaire: data collected = user ID, email, device ID,
   purchase history, gameplay content; advertising ID used for tracking
   (AdMob). **Age rating**: no mature content, ads = yes, purchases = yes.
6. **Sandbox tester**: Users and Access → Sandbox → add a tester Apple ID.

## 2. Google Play Console

1. Create the app *WordWar* (game, free, has ads, has in-app purchases).
2. **App signing**: choose Google-generated key. Copy the **App signing key
   SHA-1** and send it to me.
3. **API access**: link a Cloud project → create a service account → grant it
   *Admin (all permissions)* or at least Finance + release → create a **JSON
   key** → send me the file privately.
4. **App content**: privacy policy URL (table above), ads = yes, Data safety
   (same as 1.5 plus Advertising ID shared with AdMob), target audience 13+,
   account deletion URL (table above), content rating questionnaire.
5. **Closed testing**: create a track and an email list with at least 12
   testers. Google requires 14 days of closed testing before a new account
   can publish to production, so start it as soon as I upload the first
   build.
6. **In-app products**: create each row in section 4.
7. **License testing**: add your Gmail so test purchases aren't charged.

## 3. AdMob (apps.admob.com)

1. Add two apps (iOS and Android) named WordWar. Send me both **App IDs**
   (`ca-app-pub-…~…`).
2. For each app create **Banner**, **Interstitial** and **Rewarded** units.
   Send me the six unit IDs.
3. On each Rewarded unit: Advanced → Server-side verification → the SSV URL
   above.
4. Complete the AdMob payment profile.

Until I have these, store builds use Google's test ads, which is fine for
TestFlight and Play closed testing but not for release.

## 4. In-app products (identical in both stores)

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

## 5. Hosting (say yes or no to each)

1. Render web service → **Starter** (about $7/month) so the API never sleeps.
2. Render Key Value (Redis) **Starter** (about $10/month) instead of sharing
   the `fault` project's free one. Free alternative: an Upstash Redis URL.
3. MongoDB Atlas: **rotate the `joe` password** (it was pasted in chat) and
   send me the new connection string; optionally move to M2/M10 for backups.
4. Atlas → Network Access → allow `0.0.0.0/0` (or Render's outbound IPs).

## 6. During the first iOS build

EAS will ask for your Apple ID password and two-factor code once in the
terminal; it then creates the certificate, provisioning profile, push key
and App Store Connect record itself. Watch the terminal tab I open and type
when prompted.

## What I need back from you, in one private message

Team ID · Sign in with Apple Key ID + `.p8` · shared secret · Play signing
SHA-1 · Play service-account JSON · AdMob two app IDs + six unit IDs ·
new Atlas connection string · yes/no on section 5.
