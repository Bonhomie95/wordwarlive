// Validates the localized store listings: node store-assets/localized/check.cjs [key ...]
const fs = require('fs');
const path = require('path');

const LIMITS = { name: 30, subtitle: 30, keywords: 100, promotionalText: 170, whatsNew: 4000, shortDescription: 80, description: 4000 };
const HEADER_EMOJI = ['⚔', '🏆', '🎮', '⚡', '🎨', '📈'];
// The App Store copy of the description drops the emoji that start section headers.
const appleText = (s) => s.replace(/^[\p{Extended_Pictographic}️‍ ]+/gmu, '');

const args = process.argv.slice(2);
const keys = args.length ? args : fs.readdirSync(__dirname).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
let bad = 0;
for (const k of keys) {
  let j;
  try {
    j = JSON.parse(fs.readFileSync(path.join(__dirname, `${k}.json`), 'utf8'));
  } catch (e) {
    console.log(`${k}: ${e.message}`);
    bad++;
    continue;
  }
  const errs = [];
  const need = ['language', 'name', 'description'];
  if (j.apple) need.push('subtitle', 'keywords', 'promotionalText', 'whatsNew');
  if (j.play?.length) need.push('shortDescription');
  if (!j.apple && !j.play?.length) errs.push('needs an apple locale or play codes');
  for (const f of need) if (typeof j[f] !== 'string' || !j[f].trim()) errs.push(`missing ${f}`);
  for (const [f, max] of Object.entries(LIMITS)) if (typeof j[f] === 'string' && j[f].length > max) errs.push(`${f} is ${j[f].length}/${max}`);
  if (j.name && !j.name.startsWith('WordWar')) errs.push('name must start with WordWar');
  for (const f of ['name', 'subtitle', 'keywords', 'shortDescription']) {
    if (j[f] && /\p{Extended_Pictographic}/u.test(j[f])) errs.push(`no emoji in ${f}`);
  }
  if (j.keywords && (/[，、；;]/.test(j.keywords) || /\s,|,\s|^\s|\s$/.test(j.keywords))) errs.push('keywords: ASCII commas with no spaces around them');
  if (/wordle|scrabble/i.test(JSON.stringify(j))) errs.push('names another game');
  if (j.description) {
    for (const e of HEADER_EMOJI) if (!j.description.includes(e)) errs.push(`description lost the ${e} header`);
    if (appleText(j.description).length > 4000) errs.push('App Store description over 4000');
  }
  if (errs.length) {
    bad++;
    console.log(`${k}: ${errs.join('; ')}`);
  } else console.log(`${k}: ok`);
}
process.exit(bad ? 1 : 0);
