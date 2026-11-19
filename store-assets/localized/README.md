# Localized store listings

One JSON file per language. `en-US.json` is the source text (what is live in
English). `apple` is the App Store Connect locale (`null` = Google Play only);
`play` lists the Google Play language codes (empty = App Store only).

| Field | Limit | Store |
|---|---|---|
| `name` | 30 | App Store name and Google Play title. Starts with `WordWar`. |
| `subtitle` | 30 | App Store |
| `keywords` | 100 | App Store. Comma-separated, no spaces around commas. |
| `promotionalText` | 170 | App Store (can change without review) |
| `whatsNew` | 4000 | App Store notes for the version being submitted |
| `shortDescription` | 80 | Google Play |
| `description` | 4000 | Both. The emoji that start the section headers stay on Google Play and are removed for the App Store. |

## Rules for translations

1. **WordWar is played in English** (English dictionary, English app). Never
   suggest the game is in the listing's language. Every non-English listing
   says so: the name or subtitle contains the local word for "English", and
   the description includes the "played in English" paragraph.
2. Keep the in-app names in English, as the player will see them: WordWar,
   the tiers (Stone, Bronze, Silver, Gold, Platinum, Diamond, Master, Legend),
   the modes (Classic Ranked, Mystery Duel, Daily Challenge, Friends), the
   power-ups (Reveal, Scramble, Lock) and Elo.
3. Write natural, native marketing copy, not a literal translation. Use the
   words people search for in that language.
4. No other games' names (Wordle, Scrabble…), no "best", "#1" or "free" in the
   name, no emoji in the name, subtitle, keywords or short description.
5. Keywords: never repeat a word already in the name or subtitle (Apple
   indexes those anyway), no "game" or "app", singular forms, ASCII commas.

## Commands

```bash
node store-assets/localized/check.cjs
```

```bash
node store-assets/localized/push-play.cjs
```

`push-play.cjs` uploads every listing to Google Play in one edit (needs
`mobile/play-service-account.json`). App Store listings can only change with a
new app version (name, description and keywords are locked on a live
version), so they are entered in App Store Connect when a version is
submitted.
