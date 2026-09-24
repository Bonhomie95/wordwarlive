// Hosted legal pages — both stores need a reachable Privacy Policy URL, Apple
// wants it linked in-app, and Google Play requires a WEB page where users can
// request account deletion (in addition to the in-app flow). Rendered from
// the Markdown in server/legal at boot; no build step, no extra dependency.
//
//   GET /legal/privacy         Privacy Policy
//   GET /legal/terms           Terms of Service
//   GET /legal/delete-account  How to delete your account (Play "delete
//                              account URL")

import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGAL_DIR = join(__dirname, '../../legal');

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Inline markdown: **bold**, _em_, `code`, [text](url). Input is escaped first. */
function inline(s: string): string {
    return escapeHtml(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|\s)_(.+?)_(?=\s|$|[.,;:])/g, '$1<em>$2</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
        .replace(/(^|\s)(https?:\/\/[^\s<]+?)([.,;:)]?)(?=\s|$)/g, '$1<a href="$2">$2</a>$3');
}

/**
 * Minimal Markdown → HTML: headings, paragraphs, bullet lists, blank lines.
 * Enough for policy text; anything fancier belongs in a real renderer.
 */
export function markdownToHtml(md: string): string {
    const out: string[] = [];
    let para: string[] = [];
    let inList = false;
    const flushPara = () => {
        if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
        para = [];
    };
    const closeList = () => {
        if (inList) out.push('</ul>');
        inList = false;
    };
    for (const raw of md.split('\n')) {
        const line = raw.trimEnd();
        const h = /^(#{1,6})\s+(.*)$/.exec(line);
        const li = /^\s*[-*]\s+(.*)$/.exec(line);
        if (h) {
            flushPara();
            closeList();
            out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
        } else if (li) {
            flushPara();
            if (!inList) out.push('<ul>');
            inList = true;
            out.push(`<li>${inline(li[1]!)}</li>`);
        } else if (line.trim() === '') {
            flushPara();
            closeList();
        } else if (inList && /^\s{2,}/.test(raw)) {
            // continuation of the previous bullet
            out[out.length - 1] = out[out.length - 1]!.replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
        } else {
            para.push(line.trim());
        }
    }
    flushPara();
    closeList();
    return out.join('\n');
}

function page(title: string, body: string): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · WordWar</title>
<style>
body{margin:0;background:#0F1115;color:#F2F4F7;font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
h1,h2,h3{line-height:1.25}h1{font-size:28px}h2{font-size:20px;margin-top:32px}
a{color:#3DDC97}code{background:#1F232B;padding:1px 5px;border-radius:4px}
nav{font-size:14px;color:#9AA1AC;margin-bottom:24px}nav a{margin-right:14px}
.box{background:#16191F;border:1px solid #2A2E37;border-radius:12px;padding:16px 20px;margin:16px 0}
</style></head><body><main>
<nav><a href="/legal/privacy">Privacy Policy</a><a href="/legal/terms">Terms of Service</a><a href="/legal/delete-account">Delete account</a></nav>
${body}
</main></body></html>`;
}

function load(name: string): string {
    return readFileSync(join(LEGAL_DIR, name), 'utf8');
}

// Rendered once at boot — the files only change on deploy.
const PRIVACY_HTML = page('Privacy Policy', markdownToHtml(load('PRIVACY.md')));
const TERMS_HTML = page('Terms of Service', markdownToHtml(load('TERMS.md')));
const DELETE_HTML = page(
    'Delete your account',
    `<h1>Delete your WordWar account</h1>
<p>Deleting your account permanently removes your profile, username, rank, coins,
cosmetics, purchases record, friends, and match history. This cannot be undone.</p>
<h2>Option 1 — in the app (instant)</h2>
<div class="box">Open WordWar → <strong>Profile</strong> → <strong>Settings &amp; Theme</strong> →
<strong>Account</strong> → <strong>Delete account</strong>, then confirm.</div>
<h2>Option 2 — by email</h2>
<div class="box">Email <a href="mailto:${escapeHtml(env.SUPPORT_EMAIL)}?subject=${encodeURIComponent('WordWar account deletion request')}">${escapeHtml(env.SUPPORT_EMAIL)}</a>
with the subject <em>“WordWar account deletion request”</em> and your in-game
username (and the email you signed in with, if any). We verify the request and
delete the account within 30 days, then confirm by reply.</div>
<h2>What is deleted</h2>
<ul>
<li>Your account and sign-in identifiers (email / Apple / Google identifier / guest device id).</li>
<li>Rank, coins, cosmetics, battle-pass progress, streaks, friends, blocks, and reports you filed.</li>
<li>Your matches, guesses, and replays. Opponents keep their own aggregate win/loss counts.</li>
<li>Push-notification tokens and the purchase-verification ledger for your account.</li>
</ul>
<p>Apple / Google keep your store purchase history under their own policies;
we do not receive card or payment details. See the <a href="/legal/privacy">Privacy Policy</a>.</p>`
);

export const legalRouter = Router();

legalRouter.use((_req, res, next) => {
    // Static text only — lock the CSP down for these HTML responses.
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'public, max-age=3600');
    next();
});
legalRouter.get('/legal/privacy', (_req, res) => res.type('html').send(PRIVACY_HTML));
legalRouter.get('/legal/terms', (_req, res) => res.type('html').send(TERMS_HTML));
legalRouter.get('/legal/delete-account', (_req, res) => res.type('html').send(DELETE_HTML));
