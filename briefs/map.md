# Brief: map every screen of the app

Read AGENT_BRIEF.md first: its tools and rules apply, except the budget and the
final report, which change below. You are not a persona this time: you are the
map maker. Use the device settings of your persona (language, text size, theme),
but not its patience or goal. Your job is to reach every screen of the app once,
so that the paths of the personas can be drawn on a complete map.

1. Explore breadth first. On each new screen, take the screenshot, then open each
   control that leads somewhere (buttons, tabs, list rows, menu entries, links),
   one at a time, and come back (Back, or the app's own back control) before you
   open the next one. Do not fill the same form twice: once is enough to see where
   it leads.
2. A screen is new when its layout or its purpose is new, not when only its data
   changed (a list with one more item is the same screen).
3. Use test data only, as in AGENT_BRIEF.md. Never confirm a destructive action that
   cannot be undone on a real account (delete account, pay). Note it and go back.
4. Budget: about 60 actions. Stop earlier when every control you saw has been opened.
   A crash or a dead end is a finding: note it, as usual, and go on elsewhere.

## Final report

1. `results/<persona>/report.md`: the list of screens you found, each with its name,
   the screenshot numbers where it appears, and how to reach it from the launch
   ("Welcome > Get started > Sign-up"). Then the controls you could not open, and why.
   Then any bug you met, in the usual format.
2. `results/<persona>/findings.json`:
   `{"mode": "map", "issues": [...], "screens_found": [{"name": "Sign-up", "screens": ["03", "04"], "path": "Welcome > Get started"}]}`.
   `"mode": "map"` tells the dashboard that this path is the map maker's, not a persona's.

Your taps are written to `trace.json` like any tester's, so each screen you found has
a path that replays with no model ([docs/replay.md](../docs/replay.md)). Open the run
with the persona runs in the dashboard: `python3 scripts/dashboard.py runs/<map run> runs/<persona run>`.
