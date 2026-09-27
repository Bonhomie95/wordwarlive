// Run before submission. Public endpoint checks only; never prints credentials.
import { readFile } from 'node:fs/promises';
const eas = JSON.parse(await readFile(new URL('../eas.json', import.meta.url), 'utf8'));
const base = process.env.EXPO_PUBLIC_API_URL || eas.build?.production?.env?.EXPO_PUBLIC_API_URL;
let url;
try { url = new URL(base); } catch { throw new Error('Set EXPO_PUBLIC_API_URL to the production HTTPS API.'); }
if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|\[?::1\]?)/.test(url.hostname)) {
    throw new Error('Production API must be a public HTTPS URL without embedded credentials.');
}
let failed = false;
for (const path of ['/readyz', '/legal/privacy', '/legal/terms', '/legal/delete-account']) {
    try {
        const response = await fetch(new URL(path, url), { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (path === '/readyz') {
            const data = await response.json();
            if (!data.ok || !data.checks?.db || !data.checks?.redis) throw new Error('API, database, or Redis is not ready');
        } else {
            const text = await response.text();
            if (!response.headers.get('content-type')?.includes('text/html') || !text.includes('WordWar')) throw new Error('Expected a WordWar legal page');
        }
        console.log(`PASS ${path}`);
    } catch (error) {
        failed = true;
        console.error(`FAIL ${path}: ${error.cause?.code || error.message}`);
    }
}
if (failed) process.exitCode = 1;
else console.log('Public endpoints passed. Store, signing, privacy and device checks are still required; see APPLE-REVIEW.md.');
