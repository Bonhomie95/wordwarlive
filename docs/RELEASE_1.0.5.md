# WordWar 1.0.5 — checklist

Your list (2026-11-26) plus the follow-ups, and what I found on the way.
✅ done · 🔧 in progress · ⬜ to do · 🙋 needs you

## Your list
1. ✅ Tap your rank: ladder of every tier (Stone → Legend) with the RP each
   needs, where you are, RP to the next tier and roughly how many wins.
2. ✅ Tap W/L ratio, win streak or win rate: a stats sheet (wins, losses,
   games, current and best win streak, daily streak and its rewards, recent
   form).
3. ✅ Searching for an opponent: rolling avatars orbiting the radar, a sweep,
   and a burst when the opponent is found (seen in the simulator).
4. ✅ The ⚡ "1" in the top bar is the *daily play streak* (days in a row you
   finish a match), not XP. XP from a win goes to the Battle Pass (each tier
   unlocks rewards). Fix: streak gets its own flame icon and opens the
   streak explanation; the result screen says "Pass XP" and shows your
   Battle Pass bar filling.
5. ✅ Interstitials: one is now kept loaded in the background at all times
   (home screen + right after each one closes), so it is ready when a game
   ends. Android was still on 1.0.3 (the old "wait" version) until
   2026-11-26, when I published the approved 1.0.4.
6. ✅ XP boost: the reward was credited (+50 Pass XP each, verified), but the
   app refreshed 1.2 s after the ad, before AdMob's confirmation reached the
   server, so nothing seemed to change. Fix: wait for the confirmed credit,
   then animate it. Same for the Daily Bonus and coin ads.
7. ✅ Animated increments: coins in the top bar count up, the Pass bar fills,
   and a "+50 XP" / "+30 coins" toast plays when a reward lands.
8. 🔧 Android results panel: it ships in 1.0.4, which Android players only
   got on 2026-11-26 (published). Push notifications:
   - iPhone: works only if the player allowed notifications, and the app
     only asked on the Friends screen. Fix: ask at a good moment (opt-in card).
   - Android: 🙋 no push key exists (FCM). The app side is ready: Android
     release builds read `GOOGLE_SERVICES_JSON` (path to google-services.json,
     kept out of git) and refuse to build without it. Waiting on the Firebase
     terms tick (only the owner may accept them), then: register the Android
     app, google-services.json, FCM V1 service-account key → EAS.
   - The opt-in card now also shows on Android 13+, which reports "denied"
     (not "undetermined") before the first ask.
   - Server now logs every push result (live since 2026-11-26).
9. ✅ Screen stays on during matchmaking, matches and while ads load/show
   (Android: AdMob's ad screen flagged keep-on by a build plugin).
10. ✅ Opponent found: chime + vibration, on by default; Settings has Sound
    and Haptics switches. The chime respects the silent switch.
11. ✅ Share daily/weekly results (results card + leaderboard).
12. ✅ Ask for a store rating: after 3 days or 3 opens, after a win (never
    right after an ad); if nothing comes of it, ask again after 1 week, then
    2 weeks, then stop. Uses the stores' own rating sheet. Apple and Google
    forbid a custom "Do you like the app?" question first, and neither tells
    the app whether the player rated.
13. ✅ Analytics, baseline taken 2026-11-26 (compare ~2 weeks after 1.0.5 is live):
    - App Store, Nov 12–25: 2,249 impressions (1,858 unique, 1,854 from
      search, 86% US), 18 unique product-page views, 7 first-time downloads
      + 1 redownload, $0 proceeds. The leak is the search card: ~1% of
      people who see WordWar in search tap it; ~39% of page visitors install.
      Unique impressions/day: ~170–280 on Nov 15–22, then 75, 52, 57 on
      Nov 23–25. English name/subtitle/keywords were the same in 1.0.2 and
      1.0.4, so this looks like new-app visibility fading, not a metadata change.
    - Google Play, 28 days to Nov 23: 477 impressions, 5 acquisitions, 6
      listing visitors, 2 install clicks (too few for Play to show search terms).
    - AdMob: $0.93 this month to Nov 26; last 7 days 773 requests, 459
      impressions, 67.4% match rate, $1.80 eCPM. Mediation would lift the
      match rate later; not worth it at this volume.
    - Changed in 1.0.5 (App Store, English): subtitle "Race a live rival to
      the word" → "Multiplayer Word Guess Battle"; keywords drop anagram and
      spelling (and multiplayer/battle/guess, now in the subtitle), add
      challenge, brain, 5, letter, race, live, rival; screenshots now start
      with gameplay (match, victory, home, modes). Google Play (with the
      Android release): short description leads with "Multiplayer word guess
      battle".
    - In-app events (server, live): rank_ladder_view, stats_view, share_tap,
      review_prompt, notify_prompt.

## Your follow-ups
- ✅ Reminder notifications (scheduled on the phone, work on Android without
  Firebase): daily streak at risk, Daily Bonus ready, leaderboard closing
  soon, come back after a few days away. Capped so they never spam.
- ✅ Ratings (item 12).

## Found on the way
- ✅ Battle Pass Season Two ends ~Dec 29 and nothing would have started
  Season Three: XP would have gone nowhere. Seasons now roll over by
  themselves (server, live).
- ✅ Push errors were swallowed; now logged.
- ✅ Start-and-quit paid 25 Battle Pass XP every time (about four quits per
  tier). Quitting, or losing without a single guess, now earns no Pass XP,
  the same rule as match coins (server b8524dd, live with the next deploy).
- ✅ Android check of the 1.0.5 preview build on the Pixel_9_Pro emulator
  (API 37): starts, rewarded ad opens with KEEP_SCREEN_ON and no crash,
  matchmaking orbit, result screen with the Pass card, the notification card
  appears after the first match, the system prompt shows, and the weekly
  reminder is scheduled as an alarm.
- 🙋 Sign in with Apple for new players: Apple-side (Feedback report).
- ✅ 1.0.5 "What's New" in all 78 store languages.
- ✅ GitHub CI green on main before building/publishing.
- ✅ Pulled main; the Launch check session confirmed nothing pending.
- ✅ CueMaster session told when the iOS release build started and ended.

## Release status
- iOS 1.0.5 (build 22): submitted 2026-11-27 02:30 UTC, releases
  automatically once approved.
- Android 1.0.5: held for FCM (push) so the opt-in card's promise is true on
  Android; a preview APK is tested on the Pixel_9_Pro emulator meanwhile.

## Still to do
- 🙋 Firebase terms tick, then Android FCM setup, Android production build
  (check the Gradle log runs the google-services task), Play upload with
  release notes and the listing push, then Publish after approval.
