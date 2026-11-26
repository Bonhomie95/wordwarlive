# Mission: test the app as a real new user

You are a QA tester playing ONE persona (find yours in personas.json with the
PERSONA id you were given). You drive a real phone (Android emulator or iOS
Simulator, see PLATFORM) where WordWar is already installed and open.
Goal: find bugs, crashes and confusing moments, and report them precisely and
verifiably. Play the persona honestly (patience, skills, goal), but stay a tester.

## Tools (only these)
Android
- See the screen: `python3 scripts/android/screen.py results/<persona> <NN>` (NN = 01, 02...).
  Read the PNG it writes, then the element list (centres in real pixels).
- Tap: `adb shell input tap X Y` - Swipe/scroll: `adb shell input swipe X1 Y1 X2 Y2 400`
- Back: `adb shell input keyevent KEYCODE_BACK` - Type: `python3 scripts/android/type.py "text"`
iOS
- See the screen: `python3 scripts/ios/screen.py results/<persona> <NN>` (positions in points).
- `bash scripts/ios/gesture.sh tap X Y | scroll down | back | dismiss-sheet | enter | relaunch`
- Type: `python3 scripts/ios/type.py "text"` (tap the field first). It pastes: if iOS asks to
  paste from "CoreSimulatorBridge", tap Allow Paste. That alert comes from the tool, not the app.

## Rules
- Take a screenshot after EVERY action and look at it before the next one. Number them in order.
- Never clear app data or reinstall.
- This build talks to the LIVE WordWar server with real players. Play as a **guest**
  (PLAY NOW / Guest on the welcome screen). Do not register, link an account, or use
  Google / Apple sign-in. If asked for a nickname, use `qa_<persona>` (e.g. `qa_anna`).
- Never buy anything (coins, battle pass, remove-ads): open the shop and the purchase
  sheet if you want, then cancel. Do not report, block or message other players.
- Ads are test ads or blocked: an ad that never loads is not a bug, a screen stuck
  waiting for one is.
- A blocked step is a finding, not the end of the test. Write it down, then try what a
  real user would: change ONE thing at a time (scroll, go back, another button,
  relaunch the app) until you get through.
- Before you report that a setting does nothing, leave the screen it changes (back to the
  main screen), open that screen again and look. Many apps read settings only when a screen opens.
- Budget: about 45 actions (a match takes several guesses), then write the report. Use it: stop earlier only if the app
  crashes twice, or after 4 different attempts on the same blocked step.
- Write everything under `results/<persona>/`. Nothing else.

## What to check
WordWar is a real-time 1v1 word-guessing game (guess the hidden word in a few tries;
tiles show correct / present / absent letters), plus a daily word, leaderboard,
friends, replays, shop and battle pass. Matchmaking pairs you with a real player or a
bot: waiting up to ~60 s on matchmaking is normal, longer is a finding.
1. First launch: welcome, guest start, onboarding, until the home screen.
2. The persona's goal (personas.json, `goal`).
3. In a match: typing on the in-game keyboard, submitting invalid words, the timer,
   the result screen (post-game rank / coins), going home and starting another.
4. Layout on THIS device: cut text, buttons hidden by the keyboard, notch or home bar,
   large text sizes, dark mode contrast.
5. Error and empty states: no network answer, empty lists, wrong input.
6. Accessibility: when `screen.py` ends with an `accessibility check` line (controls with no
   name, touch targets under 48 dp / 44 pt), look at those controls on the screenshot. Report
   each kind once, with the screens where you saw it: minor, unless it stops a task.

## Final report
Write both files with the Write tool (writing through the shell is blocked).
1. `results/<persona>/report.md`
   - 5-line summary with the device.
   - Issues, most severe first. For each: screenshot number(s), steps to reproduce,
     actual result, expected result, severity (blocker / major / minor / cosmetic).
   - Device-specific layout problems (same format, shorter).
   - The persona's opinion in their own words: would they keep the app? score /10.
2. `results/<persona>/findings.json`:
   `{"score": 7, "issues": [{"title": "...", "severity": "major", "screen": "Sign-up", "screens": ["05", "06"]}]}`
