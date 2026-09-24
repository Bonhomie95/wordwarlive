// AdMob Server-Side Verification (SSV) and reward granting.
//
// Flow:
//   1. Mobile client requests a rewarded ad with `customData = "{userId}|{kind}"`.
//   2. Player watches the ad; AdMob fires our SSV callback URL with query
//      params: ad_network, ad_unit, custom_data, key_id, reward_amount,
//      reward_item, signature, timestamp, transaction_id, user_id.
//   3. We verify the signature (ECDSA P-256) using AdMob's public keys.
//   4. If valid AND we haven't seen this transaction_id before, we grant the
//      reward atomically.
//
// AdMob keys: https://www.gstatic.com/admob/reward/verifier-keys.json
// Docs:       https://developers.google.com/admob/android/ssv

import crypto from 'node:crypto';
import { pool, query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { awardMatchXp } from './battlePassService.js';

// ─── Reward kinds ───────────────────────────────────────────────────────────
//
// Each kind corresponds to a UI slot. Daily limits / amounts live here so
// the client and server stay aligned via the /me payload.
//
//   daily_bonus   — once per local day, +30 coins + 75 BP XP + 1 power-up
//   bp_xp_boost   — up to 5 per UTC day, +50 BP XP each
//   coin_boost    — up to 3 per UTC day, +25 coins each

export type RewardKind = 'daily_bonus' | 'bp_xp_boost' | 'coin_boost';

const DAILY_BONUS_XP = 75;
const DAILY_BONUS_COINS = 30;
const XP_BOOST_AMOUNT = 50;
const XP_BOOST_DAILY_LIMIT = 5;
export const COIN_AD_AMOUNT = 25;
export const COIN_AD_DAILY_LIMIT = 3;

// ─── Public keys cache ──────────────────────────────────────────────────────

interface PublicKey {
    keyId: number;
    /** PEM-encoded EC public key. */
    pem: string;
}

let cachedKeys: PublicKey[] | null = null;
let keysFetchedAt = 0;
const KEY_CACHE_MS = 1000 * 60 * 60; // 1 hour

async function getPublicKeys(): Promise<PublicKey[]> {
    if (cachedKeys && Date.now() - keysFetchedAt < KEY_CACHE_MS) {
        return cachedKeys;
    }
    const res = await fetch(
        'https://www.gstatic.com/admob/reward/verifier-keys.json'
    );
    if (!res.ok) {
        throw new Error(`Could not fetch AdMob verifier keys: ${res.status}`);
    }
    const body = (await res.json()) as {
        keys: { keyId: number; pem: string; base64: string }[];
    };
    cachedKeys = body.keys.map((k) => ({ keyId: k.keyId, pem: k.pem }));
    keysFetchedAt = Date.now();
    return cachedKeys;
}

// ─── Signature verification ─────────────────────────────────────────────────

/**
 * AdMob signs the unsigned portion of the callback URL: every query param
 * EXCEPT `signature` and `key_id`, in their original order. Both query-string
 * delimiters and the signature/key_id pair are stripped.
 *
 * Build the message-to-verify ourselves from the raw query string.
 */
function buildSignedMessage(rawQuery: string): string {
    // rawQuery comes in as "ad_network=...&ad_unit=...&signature=...&key_id=...&..."
    // The signed portion is everything BEFORE the `&signature=` (and
    // including the `&key_id=...` does NOT appear before signature in the
    // canonical order — AdMob always appends signature and key_id LAST).
    const sigIdx = rawQuery.indexOf('&signature=');
    if (sigIdx < 0) throw new Error('No signature in callback');
    return rawQuery.slice(0, sigIdx);
}

function base64UrlToBuffer(b64url: string): Buffer {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return Buffer.from(padded, 'base64');
}

export async function verifySsvSignature(args: {
    rawQuery: string;
    signature: string;
    keyId: string;
}): Promise<boolean> {
    const keys = await getPublicKeys();
    const key = keys.find((k) => String(k.keyId) === args.keyId);
    if (!key) {
        logger.warn({ keyId: args.keyId }, 'Unknown AdMob key id');
        return false;
    }
    const message = buildSignedMessage(args.rawQuery);
    const sigBuf = base64UrlToBuffer(args.signature);
    try {
        return crypto.verify(
            'sha256',
            Buffer.from(message, 'utf8'),
            { key: key.pem, dsaEncoding: 'der' },
            sigBuf
        );
    } catch (err) {
        logger.warn({ err }, 'SSV verify threw');
        return false;
    }
}

// ─── Reward granting ────────────────────────────────────────────────────────

interface SsvParams {
    transaction_id: string;
    custom_data: string; // "userId|rewardKind"
    reward_amount: string;
    reward_item: string;
    /** Player's timezone offset in minutes east of UTC (matches Date.getTimezoneOffset() inverted).
     *  Optional — falls back to UTC if missing. */
    tz_offset_minutes?: number;
}

interface GrantResult {
    granted: boolean;
    error?: string;
    rewardKind?: RewardKind;
}

export async function processSsvReward(p: SsvParams): Promise<GrantResult> {
    const parts = p.custom_data.split('|');
    if (parts.length !== 2) return { granted: false, error: 'Bad custom_data' };
    const [userId, rewardKindRaw] = parts;
    if (!userId || !rewardKindRaw) {
        return { granted: false, error: 'Bad custom_data' };
    }
    const rewardKind = rewardKindRaw as RewardKind;
    if (!['daily_bonus', 'bp_xp_boost', 'coin_boost'].includes(rewardKind)) {
        return { granted: false, error: `Unknown reward kind: ${rewardKind}` };
    }

    const reportedAmount = Number(p.reward_amount) || 0;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert the reward record. ON CONFLICT DO NOTHING means duplicate
        // transaction_ids no-op — AdMob's retries become safe.
        const insertRes = await client.query<{ transaction_id: string }>(
            `INSERT INTO ad_rewards
                (transaction_id, user_id, reward_kind, reported_amount, granted)
             VALUES ($1, $2, $3, $4, FALSE)
             ON CONFLICT (transaction_id) DO NOTHING
             RETURNING transaction_id`,
            [p.transaction_id, userId, rewardKind, reportedAmount]
        );

        if (insertRes.rowCount === 0) {
            // Already processed.
            await client.query('COMMIT');
            return { granted: false, error: 'Duplicate transaction', rewardKind };
        }

        // Apply the reward and check daily limits server-side.
        if (rewardKind === 'daily_bonus') {
            const okRes = await client.query<{
                last_daily_ad_at: Date | null;
            }>(
                'SELECT last_daily_ad_at FROM users WHERE id = $1 FOR UPDATE',
                [userId]
            );
            const last = okRes.rows[0]?.last_daily_ad_at;
            if (
                last &&
                sameLocalDay(new Date(last), new Date(), p.tz_offset_minutes ?? 0)
            ) {
                await client.query('ROLLBACK');
                return { granted: false, error: 'Daily bonus already claimed today' };
            }

            // Pick a random power-up.
            const powerups = ['reveal', 'scramble', 'lock'] as const;
            const pick = powerups[Math.floor(Math.random() * powerups.length)]!;

            // Grant the power-up, coins, and battle-pass XP as ONE atomic unit
            // with the completion flag. Previously coins/XP were granted AFTER
            // commit (via helpers that each open their own connection — they'd
            // otherwise deadlock on the row we lock here). But that lost the
            // coins permanently on any transient failure: ad_rewards was already
            // granted=TRUE, so AdMob's retry was deduped away. Inlining them
            // (safe — same already-locked row, one connection) means a failure
            // rolls the whole reward back and the retry re-grants cleanly.
            const seasonRes = await client.query<{ season_number: number }>(
                `SELECT season_number FROM battle_pass_seasons
                 WHERE now() BETWEEN starts_at AND ends_at
                 ORDER BY season_number DESC LIMIT 1`
            );
            const seasonNo = seasonRes.rows[0]?.season_number ?? null;
            await client.query(
                `UPDATE users SET
                    last_daily_ad_at = now(),
                    powerup_${pick} = powerup_${pick} + 1,
                    coins = coins + $2,
                    battle_pass_xp = CASE
                        WHEN $3::int IS NULL THEN battle_pass_xp
                        WHEN battle_pass_season = $3 THEN battle_pass_xp + $4
                        ELSE $4 END,
                    battle_pass_season = COALESCE($3::int, battle_pass_season),
                    updated_at = now()
                 WHERE id = $1`,
                [userId, DAILY_BONUS_COINS, seasonNo, DAILY_BONUS_XP]
            );
            await client.query(
                `INSERT INTO coin_grants (user_id, amount, source, metadata)
                 VALUES ($1, $2, 'ad_reward', $3)`,
                [userId, DAILY_BONUS_COINS, { kind: 'daily_bonus' }]
            );
            await client.query(
                `UPDATE ad_rewards SET granted = TRUE, granted_at = now()
                 WHERE transaction_id = $1`,
                [p.transaction_id]
            );
            await client.query('COMMIT');
            return { granted: true, rewardKind };
        }

        if (rewardKind === 'bp_xp_boost') {
            const today = new Date().toISOString().slice(0, 10);
            const userRes = await client.query<{
                xp_boost_ads_today: number;
                xp_boost_ads_day: string | null;
            }>(
                `SELECT xp_boost_ads_today, to_char(xp_boost_ads_day, 'YYYY-MM-DD') AS xp_boost_ads_day
                 FROM users WHERE id = $1 FOR UPDATE`,
                [userId]
            );
            const u = userRes.rows[0];
            if (!u) {
                await client.query('ROLLBACK');
                return { granted: false, error: 'User not found' };
            }
            const onSameDay = u.xp_boost_ads_day === today;
            const watchedToday = onSameDay ? u.xp_boost_ads_today : 0;
            if (watchedToday >= XP_BOOST_DAILY_LIMIT) {
                await client.query('ROLLBACK');
                return { granted: false, error: 'Daily XP boost limit reached' };
            }
            await client.query(
                `UPDATE users SET
                    xp_boost_ads_today = $1,
                    xp_boost_ads_day = $2::date,
                    updated_at = now()
                 WHERE id = $3`,
                [watchedToday + 1, today, userId]
            );
            await client.query(
                `UPDATE ad_rewards SET granted = TRUE, granted_at = now()
                 WHERE transaction_id = $1`,
                [p.transaction_id]
            );
            await client.query('COMMIT');
            await bumpBattlePassXp(userId, XP_BOOST_AMOUNT);
            return { granted: true, rewardKind };
        }

        if (rewardKind === 'coin_boost') {
            const today = new Date().toISOString().slice(0, 10);
            const userRes = await client.query<{
                coin_ads_today: number;
                coin_ads_day: string | null;
            }>(
                `SELECT coin_ads_today, to_char(coin_ads_day, 'YYYY-MM-DD') AS coin_ads_day
                 FROM users WHERE id = $1 FOR UPDATE`,
                [userId]
            );
            const u = userRes.rows[0];
            if (!u) {
                await client.query('ROLLBACK');
                return { granted: false, error: 'User not found' };
            }
            const watchedToday = u.coin_ads_day === today ? u.coin_ads_today : 0;
            if (watchedToday >= COIN_AD_DAILY_LIMIT) {
                await client.query('ROLLBACK');
                return { granted: false, error: 'Daily coin ad limit reached' };
            }
            await client.query(
                `UPDATE users SET coin_ads_today = $1, coin_ads_day = $2::date,
                                  coins = coins + $3, updated_at = now()
                 WHERE id = $4`,
                [watchedToday + 1, today, COIN_AD_AMOUNT, userId]
            );
            await client.query(
                `INSERT INTO coin_grants (user_id, amount, source, metadata)
                 VALUES ($1, $2, 'ad_reward', $3)`,
                [userId, COIN_AD_AMOUNT, { kind: 'coin_boost' }]
            );
            await client.query(
                `UPDATE ad_rewards SET granted = TRUE, granted_at = now()
                 WHERE transaction_id = $1`,
                [p.transaction_id]
            );
            await client.query('COMMIT');
            return { granted: true, rewardKind };
        }

        await client.query('ROLLBACK');
        return { granted: false, error: 'Unhandled reward kind' };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Compare two timestamps and return whether they fall on the same calendar
 * day in the player's local timezone. tzOffsetMinutes is the offset east of
 * UTC in minutes (e.g. WAT/Lagos = +60, EST = -300). Falls back to UTC if 0.
 */
function sameLocalDay(a: Date, b: Date, tzOffsetMinutes: number): boolean {
    const aLocal = new Date(a.getTime() + tzOffsetMinutes * 60_000);
    const bLocal = new Date(b.getTime() + tzOffsetMinutes * 60_000);
    return (
        aLocal.getUTCFullYear() === bLocal.getUTCFullYear() &&
        aLocal.getUTCMonth() === bLocal.getUTCMonth() &&
        aLocal.getUTCDate() === bLocal.getUTCDate()
    );
}

/**
 * Add raw XP to the user's current battle-pass progress. Bypasses the
 * match-result XP scaling (which is for played matches).
 */
async function bumpBattlePassXp(userId: string, xp: number): Promise<void> {
    // We piggy-back on awardMatchXp's logic; there's no other XP source
    // currently. Using 'tie' would award the wrong number — instead we
    // perform a direct increment, mirroring the row-level lock approach.
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        const seasonRes = await c.query<{
            season_number: number;
            xp_per_tier: number;
            max_tier: number;
        }>(
            `SELECT season_number, xp_per_tier, max_tier
             FROM battle_pass_seasons
             WHERE now() BETWEEN starts_at AND ends_at
             ORDER BY season_number DESC LIMIT 1`
        );
        const s = seasonRes.rows[0];
        if (!s) {
            await c.query('COMMIT');
            return;
        }
        const userRow = await c.query<{
            battle_pass_xp: number;
            battle_pass_season: number;
        }>(
            `SELECT battle_pass_xp, battle_pass_season FROM users
             WHERE id = $1 FOR UPDATE`,
            [userId]
        );
        const u = userRow.rows[0];
        if (!u) {
            await c.query('COMMIT');
            return;
        }
        const baseXp =
            u.battle_pass_season === s.season_number ? u.battle_pass_xp : 0;
        const newXp = baseXp + xp;
        await c.query(
            `UPDATE users SET battle_pass_xp = $1, battle_pass_season = $2,
                              updated_at = now()
             WHERE id = $3`,
            [newXp, s.season_number, userId]
        );
        await c.query('COMMIT');
    } catch (err) {
        await c.query('ROLLBACK');
        throw err;
    } finally {
        c.release();
    }
}

// ─── Remove Ads IAP ─────────────────────────────────────────────────────────

export async function applyRemoveAdsPurchase(userId: string): Promise<void> {
    // The IAP receipt is verified upstream in routes/ads.ts (verifyIapPurchase)
    // before this runs.
    await query(
        `UPDATE users SET ads_removed = TRUE, updated_at = now() WHERE id = $1`,
        [userId]
    );
}

// Reference imports so linters don't complain about awardMatchXp being
// re-exported but unused at this layer.
void awardMatchXp;
