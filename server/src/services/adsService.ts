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
import { col, newId, registerIndexes, todayStr } from '../db/mongo.js';
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

registerIndexes('ad_rewards', [
    { key: { transaction_id: 1 }, unique: true },
    { key: { user_id: 1, created_at: -1 } },
]);
registerIndexes('users', [{ key: { id: 1 }, unique: true }]);
registerIndexes('coin_grants', [{ key: { id: 1 }, unique: true }]);
registerIndexes('battle_pass_seasons', [{ key: { starts_at: 1, ends_at: 1 } }]);

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
    const rewards = col('ad_rewards');
    const users = col('users');

    // Insert the reward record first. The unique transaction_id index makes
    // duplicate callbacks no-op — AdMob's retries become safe.
    try {
        await rewards.insertOne({
            transaction_id: p.transaction_id, user_id: userId, reward_kind: rewardKind,
            reported_amount: reportedAmount, granted: false, granted_at: null, created_at: new Date(),
        });
    } catch (err) {
        if ((err as { code?: number }).code === 11000) {
            return { granted: false, error: 'Duplicate transaction', rewardKind };
        }
        throw err;
    }

    // ponytail: no multi-doc transaction. Each grant is ONE conditional user
    // update (daily-limit check in the filter), so limits can't be raced past;
    // on any non-grant we delete the ad_rewards row, mirroring the old ROLLBACK.
    const discard = () => rewards.deleteOne({ transaction_id: p.transaction_id });
    const markGranted = () => rewards.updateOne(
        { transaction_id: p.transaction_id },
        { $set: { granted: true, granted_at: new Date() } }
    );
    const logCoins = (amount: number, kind: RewardKind) =>
        col('coin_grants').insertOne({
            id: newId(), user_id: userId, amount, source: 'ad_reward', metadata: { kind }, created_at: new Date(),
        });

    try {
        if (rewardKind === 'daily_bonus') {
            // "Not yet claimed today (player-local)" ⇔ last_daily_ad_at < start of local day.
            const tz = p.tz_offset_minutes ?? 0;
            const localNow = new Date(Date.now() + tz * 60_000);
            const dayStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - tz * 60_000);

            // Pick a random power-up.
            const powerups = ['reveal', 'scramble', 'lock'] as const;
            const pick = powerups[Math.floor(Math.random() * powerups.length)]!;

            const seasonNo = (await currentSeason())?.season_number ?? null;
            const r = await users.updateOne(
                { id: userId, $or: [{ last_daily_ad_at: null }, { last_daily_ad_at: { $lt: dayStart } }] },
                [{ $set: {
                    last_daily_ad_at: '$$NOW',
                    [`powerup_${pick}`]: { $add: [{ $ifNull: [`$powerup_${pick}`, 0] }, 1] },
                    coins: { $add: ['$coins', DAILY_BONUS_COINS] },
                    ...bpXpSet(seasonNo, DAILY_BONUS_XP),
                    updated_at: '$$NOW',
                } }]
            );
            if (!r.matchedCount) {
                await discard();
                return { granted: false, error: 'Daily bonus already claimed today' };
            }
            await logCoins(DAILY_BONUS_COINS, 'daily_bonus');
            await markGranted();
            return { granted: true, rewardKind };
        }

        if (rewardKind === 'bp_xp_boost') {
            const today = todayStr();
            const r = await users.updateOne(
                { id: userId, $or: [{ xp_boost_ads_day: { $ne: today } }, { xp_boost_ads_today: { $lt: XP_BOOST_DAILY_LIMIT } }] },
                [{ $set: {
                    xp_boost_ads_today: { $cond: [{ $eq: ['$xp_boost_ads_day', today] }, { $add: ['$xp_boost_ads_today', 1] }, 1] },
                    xp_boost_ads_day: today,
                    updated_at: '$$NOW',
                } }]
            );
            if (!r.matchedCount) {
                await discard();
                const exists = await users.countDocuments({ id: userId }, { limit: 1 });
                return { granted: false, error: exists ? 'Daily XP boost limit reached' : 'User not found' };
            }
            await markGranted();
            await bumpBattlePassXp(userId, XP_BOOST_AMOUNT);
            return { granted: true, rewardKind };
        }

        if (rewardKind === 'coin_boost') {
            const today = todayStr();
            const r = await users.updateOne(
                { id: userId, $or: [{ coin_ads_day: { $ne: today } }, { coin_ads_today: { $lt: COIN_AD_DAILY_LIMIT } }] },
                [{ $set: {
                    coin_ads_today: { $cond: [{ $eq: ['$coin_ads_day', today] }, { $add: ['$coin_ads_today', 1] }, 1] },
                    coin_ads_day: today,
                    coins: { $add: ['$coins', COIN_AD_AMOUNT] },
                    updated_at: '$$NOW',
                } }]
            );
            if (!r.matchedCount) {
                await discard();
                const exists = await users.countDocuments({ id: userId }, { limit: 1 });
                return { granted: false, error: exists ? 'Daily coin ad limit reached' : 'User not found' };
            }
            await logCoins(COIN_AD_AMOUNT, 'coin_boost');
            await markGranted();
            return { granted: true, rewardKind };
        }

        await discard();
        return { granted: false, error: 'Unhandled reward kind' };
    } catch (err) {
        await discard();
        throw err;
    }
}

async function currentSeason(): Promise<{ season_number: number } | null> {
    const now = new Date();
    return col<{ season_number: number }>('battle_pass_seasons').findOne(
        { starts_at: { $lte: now }, ends_at: { $gte: now } },
        { sort: { season_number: -1 }, projection: { _id: 0, season_number: 1 } }
    );
}

/**
 * Pipeline-update fields that add `xp` to the user's battle-pass progress
 * for `seasonNo`, resetting XP/premium if the user is still on an old season.
 * No-op when there is no active season.
 */
function bpXpSet(seasonNo: number | null, xp: number): Record<string, unknown> {
    if (seasonNo === null) return {};
    const same = { $eq: ['$battle_pass_season', seasonNo] };
    return {
        battle_pass_xp: { $cond: [same, { $add: ['$battle_pass_xp', xp] }, xp] },
        battle_pass_premium: { $cond: [same, '$battle_pass_premium', false] },
        battle_pass_season: seasonNo,
    };
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
    const s = await currentSeason();
    if (!s) return;
    await col('users').updateOne(
        { id: userId },
        [{ $set: { ...bpXpSet(s.season_number, xp), updated_at: '$$NOW' } }]
    );
}

// ─── Remove Ads IAP ─────────────────────────────────────────────────────────

export async function applyRemoveAdsPurchase(userId: string): Promise<void> {
    // The IAP receipt is verified upstream in routes/ads.ts (verifyIapPurchase)
    // before this runs.
    await col('users').updateOne({ id: userId }, { $set: { ads_removed: true, updated_at: new Date() } });
}

// Reference imports so linters don't complain about awardMatchXp being
// re-exported but unused at this layer.
void awardMatchXp;
