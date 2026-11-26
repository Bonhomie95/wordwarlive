# WordWar 1.0.5 — checklist

Your list (2026-11-26) plus the follow-ups, and what I found on the way.
✅ done · 🔧 in progress · ⬜ to do · 🙋 needs you

## Your list
1. 🔧 Tap your rank: ladder of every tier (Stone → Legend) with the RP each
   needs, where you are, RP to the next tier and roughly how many wins.
2. 🔧 Tap W/L ratio, win streak or win rate: a stats sheet (wins, losses,
   games, current and best win streak, daily streak and its rewards, recent
   form).
3. ⬜ Searching for an opponent: rolling avatars orbiting the radar, a sweep,
   and a burst when the opponent is found.
4. ⬜ The ⚡ "1" in the top bar is the *daily play streak* (days in a row you
   finish a match), not XP. XP from a win goes to the Battle Pass (each tier
   unlocks rewards). Fix: streak gets its own flame icon and opens the
   streak explanation; the result screen says "Pass XP" and shows your
   Battle Pass bar filling.
5. 🔧 Interstitials: one is now kept loaded in the background at all times
   (home screen + right after each one closes), so it is ready when a game
   ends. Android was still on 1.0.3 (the old "wait" version) until
   2026-11-26, when I published the approved 1.0.4.
6. ⬜ XP boost: the reward was credited (+50 Pass XP each, verified), but the
   app refreshed 1.2 s after the ad, before AdMob's confirmation reached the
   server, so nothing seemed to change. Fix: wait for the confirmed credit,
   then animate it. Same for the Daily Bonus and coin ads.
7. ⬜ Animated increments: coins in the top bar count up, the Pass bar fills,
   and a "+50 XP" / "+30 coins" toast plays when a reward lands.
8. 🔧 Android results panel: it ships in 1.0.4, which Android players only
   got on 2026-11-26 (published). Push notifications:
   - iPhone: works only if the player allowed notifications, and the app
     only asked on the Friends screen. Fix: ask at a good moment (opt-in card).
   - Android: 🙋 no push key exists (FCM). Needs a Firebase project + key.
   - Server now logs every push result (live since 2026-11-26).
9. ✅ Screen stays on during matchmaking, matches and while ads load/show
   (Android: AdMob's ad screen flagged keep-on by a build plugin).
10. 🔧 Opponent found: chime + vibration, on by default; Settings has Sound
    and Haptics switches. The chime respects the silent switch.
11. ⬜ Share daily/weekly results (results card + leaderboard).
12. ⬜ Ask for a store rating: after 3 days or 3 opens, after a win (never
    right after an ad); if nothing comes of it, ask again after 1 week, then
    2 weeks, then stop. Uses the stores' own rating sheet. Apple and Google
    forbid a custom "Do you like the app?" question first, and neither tells
    the app whether the player rated.
13. ⬜ Analytics: store numbers (App Store Connect, Play) and listing; new
    in-app events: rank_ladder_view, stats_view, share_tap, review_prompt,
    notify_prompt (server live).

## Your follow-ups
- ⬜ Reminder notifications (scheduled on the phone, work on Android without
  Firebase): daily streak at risk, Daily Bonus ready, leaderboard closing
  soon, come back after a few days away. Capped so they never spam.
- ⬜ Ratings (item 12).

## Found on the way
- ✅ Battle Pass Season Two ends ~Dec 29 and nothing would have started
  Season Three: XP would have gone nowhere. Seasons now roll over by
  themselves (server, live).
- ✅ Push errors were swallowed; now logged.
- 🙋 Sign in with Apple for new players: Apple-side (Feedback report).
- ⬜ 1.0.5 "What's New" in all store languages before submitting.
- ⬜ Message the CueMaster session when the 1.0.5 iOS release build starts and when it ends (two local iOS release builds at once break signing).
