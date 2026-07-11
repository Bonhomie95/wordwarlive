// In-app-purchase verification + replay protection.
//
// Every real-money grant (coins, cosmetics, battle-pass premium, remove-ads)
// funnels through verifyIapPurchase() BEFORE anything is handed out. The goal
// is to close the "trust the client" hole: a player must present a receipt the
// store actually issued, for the product we expect, and each store transaction
// can only be redeemed once.
//
// Enforcement is gated on env.IAP_ENFORCE:
//   • false (dev default) — skip the store round-trip so the shop stays
//     interactive locally, but still record the transaction for dedup.
//   • true  (production)  — verify against Apple / Google and reject anything
//     that doesn't check out.

import { JWT } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export type IapPlatform = 'ios' | 'android';

// ─── Product id conventions ──────────────────────────────────────────────────
// The store product ids we expect for each entitlement. These must match the
// products configured in App Store Connect / Google Play. Coin packs carry
// their own productId in the catalog; the rest follow this convention.
const PRODUCT_PREFIX = 'dev.bonhomieinc.wordwar';
export const REMOVE_ADS_PRODUCT_ID = `${PRODUCT_PREFIX}.remove_ads`;
export const BATTLE_PASS_PRODUCT_ID = `${PRODUCT_PREFIX}.battlepass.premium`;
export function cosmeticProductId(cosmeticId: string): string {
    return `${PRODUCT_PREFIX}.cosmetic.${cosmeticId}`;
}

export interface VerifyArgs {
    userId: string;
    /** Store product id we require the receipt to be for. */
    productId: string;
    /** Human-readable entitlement recorded in the ledger, e.g. 'remove_ads'. */
    entitlement: string;
    /** 'ios' | 'android', from the client. */
    platform?: string;
    /** iOS: base64 App Store receipt. Android: the purchase token. */
    receipt?: string;
    /** Store transaction id / orderId, used for replay protection. */
    transactionId?: string;
}

export type VerifyResult =
    | { ok: true; transactionId: string }
    | { ok: false; status: number; error: string };

function isPlatform(v: string | undefined): v is IapPlatform {
    return v === 'ios' || v === 'android';
}

/**
 * Verify a purchase and reserve its transaction id. On success the caller may
 * grant the entitlement. On failure nothing has been recorded.
 */
export async function verifyIapPurchase(
    args: VerifyArgs
): Promise<VerifyResult> {
    // ─── Dev / unenforced ────────────────────────────────────────────────────
    if (!env.IAP_ENFORCE) {
        const txnId = args.transactionId || `dev-${randomUUID()}`;
        const platform = isPlatform(args.platform) ? args.platform : 'ios';
        const reserved = await reserveTransaction({
            platform,
            transactionId: txnId,
            userId: args.userId,
            productId: args.productId,
            entitlement: args.entitlement,
        });
        if (!reserved) {
            return { ok: false, status: 409, error: 'Purchase already redeemed.' };
        }
        return { ok: true, transactionId: txnId };
    }

    // ─── Production / enforced ───────────────────────────────────────────────
    if (!isPlatform(args.platform)) {
        return { ok: false, status: 400, error: 'Missing or invalid platform.' };
    }
    if (!args.receipt) {
        return { ok: false, status: 400, error: 'Missing purchase receipt.' };
    }

    let storeTxnId: string;
    try {
        storeTxnId =
            args.platform === 'ios'
                ? await verifyApple(args.receipt, args.productId)
                : await verifyGoogle(args.receipt, args.productId);
    } catch (err) {
        logger.warn(
            { err, platform: args.platform, productId: args.productId },
            'IAP verification failed'
        );
        return { ok: false, status: 402, error: 'Could not verify purchase.' };
    }

    const reserved = await reserveTransaction({
        platform: args.platform,
        transactionId: storeTxnId,
        userId: args.userId,
        productId: args.productId,
        entitlement: args.entitlement,
    });
    if (!reserved) {
        return { ok: false, status: 409, error: 'Purchase already redeemed.' };
    }
    return { ok: true, transactionId: storeTxnId };
}

/**
 * Insert into the idempotency ledger. Returns true if this is the first time
 * we've seen (platform, transactionId), false if it was already redeemed.
 */
async function reserveTransaction(row: {
    platform: IapPlatform;
    transactionId: string;
    userId: string;
    productId: string;
    entitlement: string;
}): Promise<boolean> {
    const res = await pool.query(
        `INSERT INTO iap_transactions
             (platform, transaction_id, user_id, product_id, entitlement)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (platform, transaction_id) DO NOTHING
         RETURNING id`,
        [
            row.platform,
            row.transactionId,
            row.userId,
            row.productId,
            row.entitlement,
        ]
    );
    return (res.rowCount ?? 0) > 0;
}

// ─── Apple ────────────────────────────────────────────────────────────────────

const APPLE_PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface AppleReceiptItem {
    product_id: string;
    transaction_id: string;
}
interface AppleVerifyResponse {
    status: number;
    receipt?: { in_app?: AppleReceiptItem[] };
    latest_receipt_info?: AppleReceiptItem[];
}

async function appleVerify(
    url: string,
    receipt: string
): Promise<AppleVerifyResponse> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            'receipt-data': receipt,
            password: env.APPLE_IAP_SHARED_SECRET,
            'exclude-old-transactions': true,
        }),
    });
    if (!res.ok) throw new Error(`Apple verifyReceipt HTTP ${res.status}`);
    return (await res.json()) as AppleVerifyResponse;
}

/** Returns the store transaction id for the matching product, or throws. */
async function verifyApple(receipt: string, productId: string): Promise<string> {
    if (!env.APPLE_IAP_SHARED_SECRET) {
        throw new Error('APPLE_IAP_SHARED_SECRET not configured');
    }
    let body = await appleVerify(APPLE_PROD_URL, receipt);
    // 21007 = this is a sandbox receipt sent to production. Retry on sandbox.
    if (body.status === 21007) {
        body = await appleVerify(APPLE_SANDBOX_URL, receipt);
    }
    if (body.status !== 0) {
        throw new Error(`Apple receipt status ${body.status}`);
    }
    const items = [
        ...(body.latest_receipt_info ?? []),
        ...(body.receipt?.in_app ?? []),
    ];
    const match = items.find((it) => it.product_id === productId);
    if (!match) {
        throw new Error(`Receipt has no purchase of ${productId}`);
    }
    return match.transaction_id;
}

// ─── Google Play ──────────────────────────────────────────────────────────────

interface GooglePurchase {
    purchaseState?: number; // 0 = purchased, 1 = canceled, 2 = pending
    orderId?: string;
}

/** Returns the order id for a verified, purchased product, or throws. */
async function verifyGoogle(
    purchaseToken: string,
    productId: string
): Promise<string> {
    if (!env.GOOGLE_PLAY_PACKAGE_NAME || !env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
        throw new Error('Google Play verification not configured');
    }
    const creds = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) as {
        client_email: string;
        private_key: string;
    };
    const client = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const url =
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
        `${encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME)}/purchases/products/` +
        `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const resp = await client.request<GooglePurchase>({ url });
    const purchase = resp.data;
    if (purchase.purchaseState !== 0) {
        throw new Error(`Play purchaseState ${purchase.purchaseState}`);
    }
    // orderId is the closest thing to a unique transaction id for products.
    return purchase.orderId ?? purchaseToken;
}
