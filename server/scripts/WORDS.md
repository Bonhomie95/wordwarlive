# Word bank generation

This folder holds tooling for expanding WordWar's word bank. Two pieces:

1. **The AI prompt** below — paste into your local LLM (Llama, GPT, whatever) once per length you want.
2. **`upload-words.mjs`** — uploads a JSON file to Postgres, skipping duplicates.

The bank is keyed by length; each length is a separate JSON array. The DB
column `length` is what the rank-aware picker uses to choose word size at
match start.

---

## AI prompt template

Paste the prompt below into your model. Run it **once per word length** you
want to extend. Change the two numbers (`LENGTH` and target count) and the
"START_LETTER" sweep range, then concatenate the outputs.

A single pass typically yields 80-150 words before the model starts
repeating. Run several passes with different start letters to fill out the
length. Most context windows handle ~200 words per response cleanly.

```
You are generating a JSON array of common English words for a word-guessing
mobile game (think Wordle, but multiplayer).

REQUIREMENTS:
- Exactly LENGTH letters per word (no fewer, no more)
- Lowercase ASCII letters a-z only (no apostrophes, hyphens, accents, or proper nouns)
- Common, everyday vocabulary that a typical 16-year-old would know
- Concrete nouns, verbs, adjectives preferred over abstract or technical jargon
- Family-friendly: NO profanity, slurs, vulgarity, sexually explicit, drug-related, or violent words
- NO proper nouns (people, places, brand names)
- NO archaic, obscure, or extremely rare words (no "zymurgy", "psithurism", etc.)
- NO plurals where the singular is already common (use "apple" not "apples"; use both if both standalone)
- NO past-tense verbs where the present is more common (use "walk" not "walked"; both ok if both natural)
- Variety: span common topics — food, nature, body, emotions, actions, household, animals, weather, time

OUTPUT FORMAT:
- Pure JSON array. No markdown, no preamble, no commentary.
- Single line or pretty-printed, both fine.
- All words uppercase.

REQUEST:
Generate 200 LENGTH-letter words. Start words distributed across letters A through M.
Verify each word is exactly LENGTH letters before including it.
Skip if you're not sure of length — quality over quantity.

Example for LENGTH=5:
["APPLE","BREAD","CLOUD","DRIVE","EAGLE","FAITH",...]

Now generate the array for LENGTH=___:
```

After the first pass, run a second pass with "Start words distributed
across letters N through Z" to cover the rest of the alphabet.

---

## What to do with the output

1. Save each model response as `raw-N-1.json`, `raw-N-2.json`, etc.
   (where N is the length).
2. Run the validation + upload script:

```bash
node scripts/upload-words.mjs raw-5-1.json raw-5-2.json raw-9-batch.json
```

The script:
- Validates every word matches the format rules (right length, ASCII, no proper nouns flagged via simple heuristics)
- Deduplicates within the input AND against what's already in the DB
- Uploads in batches of 500 with `ON CONFLICT DO NOTHING`
- Prints how many were added per length and how many were skipped

If you want to clear a length and start over:

```bash
node scripts/upload-words.mjs --clear-length 9
node scripts/upload-words.mjs raw-9-fresh.json
```

If you want to back up the current bank before clearing:

```bash
node scripts/upload-words.mjs --dump > word-bank-backup.json
```
