# WordWar Mobile

The Expo SDK 57 React Native client for WordWar. Renders the live grid, captures input, and reacts to socket events from the server. The server is the source of truth — this app never knows the target word until `match_over`.

## Run it

```bash
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your dev machine's LAN IP (e.g. http://192.168.1.42:4000).
# localhost:4000 only works on simulators.

npm install
npx expo start
```

Press `i` for iOS simulator, `a` for Android, or use an installed development build on a real device. Native IAP and ads
require a development/release build; Expo Go cannot verify those integrations.

The server has to be running and reachable at `EXPO_PUBLIC_API_URL`. See `../server/README.md`.

## What's in the box

```
mobile/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # auth-gated root stack, ads SDK init
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── welcome.tsx           # all 4 auth methods
│   │   ├── login.tsx
│   │   └── register.tsx
│   └── (app)/
│       ├── _layout.tsx           # tab bar
│       ├── index.tsx             # Play / home (rank + coin balance + streak)
│       ├── profile.tsx           # rank, stats, recent matches
│       ├── leaderboard.tsx       # daily/weekly/monthly/all-time + top-3 podium
│       ├── shop.tsx              # Remove Ads + coin packs + cosmetics
│       ├── pass.tsx              # battle pass + rewarded XP boost
│       ├── matchmaking.tsx       # queue + bot fallback
│       ├── match.tsx             # ★ live game with hint system
│       └── post-game.tsx         # results + rewards card + replay
└── src/
    ├── api/                      # REST clients (auth, resources w/ coins+streak)
    ├── socket/client.ts          # Socket.io wrapper
    ├── store/                    # Zustand stores (auth, game w/ hint state)
    ├── auth/                     # Google + Apple sign-in helpers
    ├── ads/index.ts              # AdMob wrapper, Expo-Go-safe
    ├── components/
    │   ├── game/                 # Tile, Grid (w/ hint strip), Keyboard, Timer, HintButton
    │   └── ui/                   # Button, RankBadge
    ├── theme/                    # color + typography tokens
    └── types/index.ts            # mirror of server/src/types/index.ts
```

## Polished surfaces

**The live match screen** (`app/(app)/match.tsx`). Player grid, opponent mini-grid, server-driven timer with red/critical states, on-screen keyboard with per-letter color hints, shake-on-error and haptics. Animations use Reanimated for the tile flip.

**Auth flow.** All four providers wired end-to-end:
- Anonymous (device-id stored in Secure Store)
- Email + bcrypt (login + register)
- Google (`expo-auth-session/providers/google` — gives an id_token, server verifies)
- Apple (`expo-apple-authentication`, iOS only — button hidden on Android)

The auth gate in `app/_layout.tsx` redirects between `(auth)` and `(app)` groups based on token presence after hydration completes.

**State.** Zustand stores cleanly split: `authStore` owns identity + token persistence, `gameStore` owns the live match state machine. The match phase is `idle → queueing → matched → playing → finished`, transitions driven by Socket.io events.

**Shop & battle pass.** Both screens load real data from the server and round-trip purchases / claims / equips. Cosmetic previews use the `render_data` blob from the server, so adding new cosmetics doesn't require an app update.

## Inventory, purchases, and reconnect

Reveal, Scramble, and Lock controls use server-owned inventory and effects.
Board themes, avatars, borders, and name effects are rendered from catalog data.
Shop → My items includes owned exclusive rewards and supports equipping them.
Reconnect restores match history, reveals, and remaining lock duration.

The native IAP client loads the store catalog, sends purchase tokens/JWS to the
API, then finishes transactions after successful fulfillment. Missing native
billing or unavailable products produce an error instead of a release-mode
fake purchase. Restore surfaces failures and refreshes the player profile.
Real Apple sandbox and Google Play license-tester transactions still need to
be exercised with the configured store accounts; see [QA report](../QA-REPORT.md).

Push registration, app artwork, accessibility settings, and daily challenges
are implemented. External provider delivery and OAuth require device testing.

## Configuration cheat sheet

| Env var                                  | Required for                                | Notes                                              |
|------------------------------------------|---------------------------------------------|----------------------------------------------------|
| `EXPO_PUBLIC_API_URL`                    | All API + socket calls                      | Use LAN IP for physical-device testing             |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`       | Google Sign-In                              | OAuth 2.0 web client                               |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`       | Google Sign-In on iOS                       |                                                    |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`   | Google Sign-In on Android                   |                                                    |

The Google web client ID *must* be in the server's `GOOGLE_CLIENT_IDS` list. Same for the iOS and Android client IDs if you want those flows to verify on the backend.

Apple Sign-In requires no client-side keys; the server uses `APPLE_BUNDLE_ID` to validate the audience claim. Make sure the bundle ID in `app.json` matches.

## Development tips

- The protocol types in `src/types/index.ts` are a *literal copy* of `server/src/types/index.ts`. When you change the wire format, change both files. (No monorepo tool by design — keeps each side independent.)
- Run `npx tsc --noEmit` and `npm run lint` before pushing.
- Reanimated requires the Babel plugin to be the *last* plugin. Expo's babel-preset-expo handles this for SDK 57.
