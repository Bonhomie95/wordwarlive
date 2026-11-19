// Uploads every localized listing to Google Play in one edit.
// node store-assets/localized/push-play.cjs [--dry]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/dev.bonhomieinc.wordwar';
const listings = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')))
  .flatMap((j) => (j.play || []).map((language) => ({ language, title: j.name, shortDescription: j.shortDescription, fullDescription: j.description })));

(async () => {
  console.log(`${listings.length} Play listings: ${listings.map((l) => l.language).join(' ')}`);
  if (process.argv.includes('--dry')) return;
  const { JWT } = require(path.join(root, 'server/node_modules/google-auth-library'));
  const creds = require(path.join(root, 'mobile/play-service-account.json'));
  const c = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  const edit = (await c.request({ url: `${base}/edits`, method: 'POST', data: {} })).data;
  try {
    for (const l of listings) {
      await c.request({ url: `${base}/edits/${edit.id}/listings/${l.language}`, method: 'PUT', data: l }).catch((e) => {
        throw new Error(`${l.language}: ${e.response?.data?.error?.message || e.message}`);
      });
    }
    await c.request({ url: `${base}/edits/${edit.id}:commit`, method: 'POST' });
    console.log('committed');
  } catch (e) {
    await c.request({ url: `${base}/edits/${edit.id}`, method: 'DELETE' }).catch(() => {});
    throw e;
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
