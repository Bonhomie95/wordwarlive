# Brag Plan: WordWar

## What is this app?
WordWar is Wordle as a live 1v1 fight. Both players get the same hidden word and the same clock, and the first one to crack it wins. You can see your rival's tile colors update in real time, but never their letters.

## The angle
Frame a five-letter word game like a fighting-game or esports hype trailer. The joke is the gap between a calm puzzle and the fight-night staging around it: VS splash, NEMESIS label, a ticking clock, Elo. The best line is the real mechanic, "You see their colors. Never their letters." That is the part that makes it tense.

## Hook (first 2-3 seconds)
Black screen. Three short lines hit on strong beats and stack up:
FIVE LETTERS. / TWO PLAYERS. / ONE CLOCK.
Each line comes in as a row of Wordle-style tiles that flip to show its letters, so the product's visual language shows up in the first second.

## Key moments (the middle)
- The VS splash: a YOU card (green) and a NEMESIS card (red) slide in from opposite sides, then a VS badge punches in. This is copied from `VsSplash.tsx`.
- The race: your 5×6 grid fills in live (CRANE → GLAZE → BLAZE) while the opponent's mini board lights up with colors only, row by row, and gets to 4 of 5 green. The 01:12 timer counts down. Caption: "You see their colors. Never their letters."
- SOLVED!: the post-game card. "You defeated QuillReaper", +25 Elo, the GOLD rank bar fills, +coins and +XP appear, and THE WORD WAS BLAZE.

## Outro / punchline
The eight rank tiers light up left to right (Stone → Legend) and hold. Then the WordWar wordmark lands with "War" glowing green, followed by the subtitle "Real-time 1v1 word duels."

## User flow worth showing
Get matched (VS splash) → race to solve the same word while watching the rival's colors → SOLVED! result with the Elo gain.

## Tone
- Preset: cinematic
- Creative direction: an overproduced fight-night / esports trailer for a word game
- Interpretation: big type in all caps, hard, punchy reveals timed to beats, and short declarative lines. It stays in the app's dark neon look and never becomes cheesy. The humor comes from the stakes, not from gags.

## Format: landscape — 1920x1080
## Duration: 22s

## Visual identity (from the project)
- Background: #0F1115 (with the green radial aura from the store art, #3DDC97 at ~20%)
- Surface / card: #16191F, elevated #1F232B, border #2A2E37
- Accent: #3DDC97 (primary / tile correct); misplaced #F4B940; rival / danger #EF4444; info #60A5FA
- Tile wrong: #3A3D44; tile empty: #1F232B
- Text: #F2F4F7; dim #9AA1AC
- Display font: Space Grotesk (700)
- Body/label font: Space Mono (all-caps readouts, timers, RP)
- Strongest visual element: glowing green tiles plus the neon "War" in the wordmark; also the app icon (`mobile/assets/icon.png`)
- Fictional stand-ins: player "lexi_blitz" (you, GOLD) and "QuillReaper" (nemesis, PLATINUM). No real users.

## Share copy (draft)
Wordle, but someone's racing you for the same word in real time. WordWar: real-time 1v1 word duels.

## Audio direction
- Role: cinematic support with a rhythmic drive
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (114.8 BPM; its strong cues fall on the scene boundaries)
- Music treatment: starts at 0, full presence under the hook, slight dip under the race so tile ticks come through, fades out over the last ~1.2s after the wordmark
- Music cue guidance: preset read. Strong cues at 1.60s (hook line 1), 3.70s (VS splash lands), 5.80s / 6.34s (race begins), 12.65s (SOLVED! hits), 17.91s (rank ladder / outro start). Beat grid for sequential reveals: ~0.53s spacing, so hook lines go on every other beat (1.60, 2.65 → ok, 3.18 is too tight, so the stack holds until 3.70). Rank tiers can go on single beats because they are accents and the full set holds afterward.
- Audio-reactive treatment: subtle. Glow on the wordmark and the winning tiles breathes with bass. No waveform bars.
- SFX posture: moderate and matched to motion
- Audio-coupled moments: tile flips (soft clicks), typed guesses (key ticks), VS punch (impact), SOLVED! (win hit), Elo counter ticks, rank tiers (small chip clicks)
- Restraint rule: no stacked hits on every beat; tile SFX stay quiet under the music; nothing plays after the wordmark except the music tail.

## Storyboard

### Scene 1 — Hook — 3.7s (0.0–3.7)
Black with a faint green aura. Three rows of tiles stack in the center, and each flips to spell a line: "FIVE LETTERS." / "TWO PLAYERS." / "ONE CLOCK." (Space Grotesk caps). The last row's tiles flash green. Each line holds at least 0.8s, and the full stack holds about 0.6s at the end.
Sequential/interaction: yes. The three lines arrive one by one (at about 0.4s, 1.6s, 2.65s) and the tiles flip left to right inside each line.
Audio intent: builds tension with the music.
Audio-coupled idea: a tile-flip tick per letter, and a heavier click when each line settles.
Music: vol-11 from 0s
Transition mood: hard cut with a quick green flash → Scene 2

### Scene 2 — VS Splash — 2.6s (3.7–6.3)
Recreate `VsSplash`. The YOU card (green border glow, avatar circle, "lexi_blitz", GOLD badge, 142W · 61L · 70%) slides in from the left. The NEMESIS card (red, "QuillReaper", PLATINUM, 188W · 70L · 73%) slides in from the right. The round VS badge punches in with a spring overshoot. Small mono label above: "RANKED 1V1".
Sequential/interaction: yes. Cards slide in, then VS punches in (about 0.2s later).
Audio intent: the fight-night moment.
Audio-coupled idea: whooshes for the cards and an impact on VS.
Transition mood: dramatic push-in / zoom through the VS → Scene 3

### Scene 3 — The Race — 6.35s (6.3–12.65)
The match screen, recreated in landscape: a phone-framed or centered board. Top bar: YOU (green) · timer 01:12 counting down · NEMESIS (red). Left and center is your big 5×6 grid. On the right, a "NEMESIS'S BOARD" mini grid with colors only and no letters.
- Row 1: CRANE is typed and flips to gray, gray, green A (pos 3), gray, green E. The opponent's row 1 lights up in colors only.
- Row 2: GLAZE → gray G, then L A Z E all green. Opponent row 2: more green.
- Opponent row 3 hits 4/5 green (tension!), and then you type BLAZE → all five green, glowing.
Caption at the bottom from about 7.2s, held about 3s: "You see their colors. Never their letters."
Sequential/interaction: yes. Letters are typed one at a time and tiles flip left to right. Opponent rows update between your guesses.
Audio intent: tension that keeps rising.
Audio-coupled idea: key ticks for typing, flip ticks, a rising ping on the opponent's 4/5 row.
Transition mood: hard cut on the final green flip → Scene 4

### Scene 4 — SOLVED! — 5.25s (12.65–17.9)
Recreate the post-game card. The "SOLVED!" hero slams in with a glowing green halo, trophy icon above. "You defeated QuillReaper" (name in red). Elo card: "GOLD · 1560 RP" and "+25 Elo" counting up, rank bar fills to about 60%, then "+5 coins" (amber), "+60 XP" (blue), "2m 14s". Below: THE WORD WAS / BLAZE.
Sequential/interaction: yes. Hero, then subtitle, then the Elo card (counter ticks), then the stat chips (~0.25s apart as accents; full set holds ≥1.5s), then the word.
Audio intent: victory release.
Audio-coupled idea: a win hit on SOLVED!, counter ticks for the Elo, chip clicks for the rewards.
Transition mood: slow crossfade with a scale from 0.95 to 1.0 → Scene 5

### Scene 5 — Ladder + Wordmark — 4.1s (17.9–22.0)
Eight rank chips in their tier colors (Stone #7A8290, Bronze #A97142, Silver #C5CFD8, Gold #F4B940, Platinum #A1F0E1, Diamond #7CC8FF, Master #C490FF, Legend #FFD700) light up left to right on single beats. Legend gets an extra glow. The set holds about 0.6s, then collapses upward. The app icon and the "WordWar" wordmark land ("War" glowing in #3DDC97), with "REAL-TIME 1V1 WORD DUELS" in Space Mono below. Hold about 1.8s.
Sequential/interaction: yes. The tiers light up one by one.
Audio intent: final swell, then a clean ending.
Audio-coupled idea: chip clicks on the tiers and one restrained logo hit.
Transition mood: end with the music fading out.

**Music mood for this video:** cinematic / driving
**Audio summary:** A driving beat builds under the tile-flip hook, hits hard on the VS splash, stays tight and ticking through the race, releases on SOLVED!, and resolves on the wordmark.
