# Hyperframes Composition Brief: WordWar

## Objective
Create a short launch-style brag video for WordWar.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30fps
- Duration: 22 seconds

## Source Material
- Project root: this repo (`wordwar/`)
- Primary files read: README.md, store-assets/STORE-LISTING.md, mobile/src/theme/{colors,typography,effects}.ts, mobile/app/(app)/{index,post-game}.tsx, mobile/src/components/game/VsSplash.tsx, mobile/src/components/ui/Wordmark.tsx, store-assets/_sources/shot2_match.svg, store-assets/ios-screenshots/03-victory.png, mobile/assets/icon.png
- Product name: WordWar
- Tagline / strongest claim: "Real-time 1v1 word duels" / "You see your rival's tile colors update in real time, but never their letters."
- Key UI to recreate: VS splash (YOU vs NEMESIS cards), live match board + colors-only opponent board, SOLVED! post-game Elo card, 8-tier rank ladder, wordmark with glowing "War"
- Copy that must appear verbatim:
  - FIVE LETTERS / TWO PLAYERS / ONE CLOCK (as tile rows; tiles carry no punctuation)
  - YOU · NEMESIS · VS · RANKED 1V1
  - You see their colors. Never their letters.
  - SOLVED! · You defeated QuillReaper · +25 Elo · THE WORD WAS · BLAZE
  - Stone Bronze Silver Gold Platinum Diamond Master Legend
  - WordWar · REAL-TIME 1V1 WORD DUELS

## Creative Direction
- Tone preset: cinematic
- Creative direction: an overproduced fight-night / esports trailer for a word game
- Interpretation: big all-caps type, punchy beat-locked slams, short declarative lines, and the app's own dark-neon look. The humor comes from staging a Wordle round like a title fight.
- Hook: rows of Wordle tiles flip to spell FIVE LETTERS. / TWO PLAYERS. / ONE CLOCK.
- Outro: rank tiers light up Stone → Legend, then the WordWar wordmark and "REAL-TIME 1V1 WORD DUELS"
- Avoid: generic SaaS language, abstract filler visuals, redesigning the app's look

## Visual Identity
- Background: #0F1115 plus a green radial aura (#3DDC97 at ~20%)
- Surfaces: #16191F / #1F232B, border #2A2E37
- Text: #F2F4F7, dim #9AA1AC
- Accent: #3DDC97; misplaced #F4B940; rival #EF4444; info #60A5FA
- Tiles: correct #3DDC97, misplaced #F4B940, wrong #3A3D44, empty #1F232B
- Display font: Space Grotesk 700 (local TTF from the app's @expo-google-fonts dependency)
- Body font: Space Mono 400/700 (local TTF)
- Fictional stand-ins: lexi_blitz (you), QuillReaper (nemesis)

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.
1. Hook — 3.7s — three tile rows flip into the hook lines
2. VS Splash — 2.6s — YOU vs NEMESIS cards, VS punch
3. The Race — 6.35s — CRANE → GLAZE → BLAZE with the opponent's colors-only board closing in; caption
4. SOLVED! — 5.25s — hero, Elo card with counter and bar, rewards, THE WORD WAS BLAZE
5. Ladder + Wordmark — 4.1s — eight tiers, icon + wordmark + subtitle

## Audio
- Audio role: cinematic support with a rhythmic drive
- Music: assets/music/happy-beats-business-moves-vol-11-by-ende-dot-app.mp3
- Music treatment: 0.36 bed, dips to ~0.28 under the race, fades to 0 over the final ~1.2s
- Music cue guidance: preset `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.json`. Strong locks at 1.60 (hook row 2), 12.65 (SOLVED!), 17.91 (ladder). Beat grid is about 0.53s.
- Audio-reactive treatment: subtle. Bass drives the background aura and the wordmark/tile glow. No visualizer graphics.
- Audio-coupled moments: key ticks when guesses are typed, clicks on row flips, VS punch, SOLVED! bell, Elo chip stack, tier clicks, logo bell
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md`; low-risk files for repeated ticks
- Audio files: copied into `brag-output/composition/assets/`

## Hyperframes Instructions
Loaded hyperframes-core, -animation, -creative (audio-reactive), -keyframes, -cli and -audio (volume lane). Single paused GSAP timeline, local fonts via @font-face, `hyperframes check` is the gate before render.
