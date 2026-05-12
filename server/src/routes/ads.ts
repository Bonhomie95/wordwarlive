// Routes:
//   GET /api/ads/ssv                AdMob's Server-Side Verification callback.
//                                   Public (AdMob hits it directly), but
//                                   signature-verified.
//   POST /api/ads/remove-ads-purchase   Authenticated. Marks the user as
//                                       ads-free after IAP receipt verification
//                                       (verification stubbed in dev).

import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
    applyRemoveAdsPurchase,
    processSsvReward,
    verifySsvSignature,
} from '../services/adsService.js';
import { logger } from '../utils/logger.js';

export const adsRouter = Router();

adsRouter.get('/ads/ssv', async (req, res) => {
    // Reconstruct the raw query string AdMob sent us. Express's req.query
    // is parsed; we need the raw bytes to verify the signature exactly.
    // req.originalUrl is "/api/ads/ssv?ad_network=...&...".
    const idx = req.originalUrl.indexOf('?');
    const rawQuery = idx >= 0 ? req.originalUrl.slice(idx + 1) : '';

    const q = req.query as Record<string, string>;
    const signature = q.signature;
    const keyId = q.key_id;
    const transactionId = q.transaction_id;
    const customData = q.custom_data;
    const rewardAmount = q.reward_amount ?? '0';
    const rewardItem = q.reward_item ?? '';

    if (!signature || !keyId || !transactionId || !customData) {
        // Don't tell AdMob "ok" if the request is malformed — they'd never
        // retry it. But we also don't want to leak detail.
        logger.warn({ q }, 'SSV callback missing required params');
        return res.status(400).send('bad request');
    }

    let valid = false;
    try {
        valid = await verifySsvSignature({ rawQuery, signature, keyId });
    } catch (err) {
        logger.error({ err }, 'SSV signature check threw');
        return res.status(500).send('verify error');
    }
    if (!valid) {
        logger.warn({ transactionId }, 'SSV signature INVALID');
        return res.status(403).send('bad signature');
    }

    try {
        const result = await processSsvReward({
            transaction_id: transactionId,
            custom_data: customData,
            reward_amount: rewardAmount,
            reward_item: rewardItem,
        });
        if (!result.granted && result.error !== 'Duplicate transaction') {
            logger.info({ transactionId, error: result.error }, 'Reward not granted');
        }
        // AdMob expects a 2xx for retry-stop. We always 200 once the signature
        // checks out — duplicate / cap-exceeded are not retryable.
        return res.status(200).send('ok');
    } catch (err) {
        logger.error({ err }, 'Reward processing failed');
        // 5xx → AdMob will retry. We want that for transient DB issues.
        return res.status(500).send('process error');
    }
});

adsRouter.post('/ads/remove-ads-purchase', requireAuth, async (req, res) => {
    // Body shape (in prod): { receipt: string, productId: string }.
    // For now we just flip the flag. See userService TODO(prod).
    await applyRemoveAdsPurchase(req.session!.userId);
    res.json({ ok: true });
});

/**
 * Dev-only fallback for rewarded ads.
 *
 * Why this exists: AdMob's Server-Side Verification fires server-to-server
 * from Google's network. If your dev server is on localhost (or behind a
 * NAT without a public tunnel like ngrok), AdMob CAN'T REACH it, so SSV
 * never fires and the reward never lands.
 *
 * To unblock dev-client testing, this endpoint lets the *client* trigger
 * the reward grant directly after watching a test ad. It's gated by
 * NODE_ENV !== 'production' so it can never run in prod.
 *
 * The client should pass:
 *   { rewardKind: 'daily_bonus' | 'bp_xp_boost', tzOffsetMinutes: number }
 *
 * Production setups must use real SSV — never call this endpoint from a
 * release build.
 */
adsRouter.post('/ads/dev-claim-reward', requireAuth, async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    const userId = req.session!.userId;
    const { rewardKind, tzOffsetMinutes = 0 } = req.body ?? {};
    if (rewardKind !== 'daily_bonus' && rewardKind !== 'bp_xp_boost') {
        return res.status(400).json({ error: 'Invalid rewardKind' });
    }

    // Synthesise a unique transaction id so processSsvReward's idempotency
    // works the same way real SSV calls do.
    const txnId = `dev-${userId}-${Date.now()}`;
    try {
        const result = await processSsvReward({
            transaction_id: txnId,
            custom_data: `${userId}|${rewardKind}`,
            reward_amount: '1',
            reward_item: 'dev',
            tz_offset_minutes: Number(tzOffsetMinutes) || 0,
        });
        if (!result.granted) {
            return res.status(409).json({ error: result.error ?? 'Not granted' });
        }
        return res.json({ ok: true, rewardKind: result.rewardKind });
    } catch (err) {
        logger.error({ err }, 'dev-claim-reward failed');
        return res.status(500).json({ error: 'Internal error' });
    }
});
