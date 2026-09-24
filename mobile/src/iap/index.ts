// In-app purchases (StoreKit / Play Billing) via expo-iap.
//
// Flow: request a native purchase → extract the store receipt → forward it to
// our server, which verifies it (server/src/iap/verify.ts) and grants the
// entitlement → finish the transaction. The SERVER is the source of truth; this
// module never grants anything itself.
//
// Receipts, by platform, matched to what the server's verifier expects:
//   • iOS     — getReceiptDataIOS() returns the base64 App Store receipt that
//               the server posts to Apple's /verifyReceipt.
//   • Android — purchase.purchaseToken is the Play purchase token the server
//               validates via the Android Publisher API.
//
// Availability: native IAP only exists in a real build (dev client / TestFlight
// / store). In Expo Go it's absent — we short-circuit to a "dev" path that calls
// the server with no receipt, which grants directly while IAP_ENFORCE is off so
// the shop stays testable locally.

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Product, Purchase } from 'expo-iap';
import { ApiError } from '../api/client';
import {
    adsApi,
    battlePassApi,
    coinsApi,
    cosmeticsApi,
    type IapPayload,
} from '../api/resources';

// ─── Product ids (must match App Store Connect / Play Console + the server) ───
// Types: remove_ads + cosmetics are NON-consumable; coin packs and the battle
// pass are CONSUMABLE (premium is per season, so the same Apple/Google account
// must be able to buy it again next season).
const PRODUCT_PREFIX = 'dev.bonhomieinc.wordwar';
export const REMOVE_ADS_PRODUCT_ID = `${PRODUCT_PREFIX}.remove_ads`;
export const BATTLE_PASS_PRODUCT_ID = `${PRODUCT_PREFIX}.battlepass.premium`;
export const cosmeticProductId = (id: string): string =>
    `${PRODUCT_PREFIX}.cosmetic.${id}`;
export const coinPackProductId = (packId: string): string =>
    `${PRODUCT_PREFIX}.coins.${packId}`;

type IapModule = typeof import('expo-iap');

let mod: IapModule | null = null;
let connectPromise: Promise<boolean> | null = null;
/** Store product catalog (localized prices), filled by loadProducts(). */
const products = new Map<string, Product>();
/** >0 while an explicit requestPurchase() is waiting on its own listener, so
 *  the background listener leaves that transaction alone. */
let explicitPurchasesInFlight = 0;

/** Lazy-load the native module. Absent in Expo Go (storeClient) — mirrors the
 *  ads module guard so requiring it never throws past a JS try/catch. */
function load(): IapModule | null {
    if (mod) return mod;
    if (Constants.executionEnvironment === 'storeClient') return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('expo-iap') as IapModule;
        return mod;
    } catch {
        return null;
    }
}

/** True when native store purchases are possible (a real build, not Expo Go). */
export function iapAvailable(): boolean {
    return load() !== null;
}

/** Open the billing connection once. Safe to call repeatedly. */
export async function initIap(): Promise<boolean> {
    const m = load();
    if (!m) return false;
    if (connectPromise) return connectPromise;
    connectPromise = (async () => {
        try {
            await m.initConnection();
            // Transactions that arrive outside an explicit purchase flow —
            // iOS replays unfinished ones at launch, "Ask to Buy" approvals,
            // promoted purchases — get fulfilled + finished here.
            m.purchaseUpdatedListener((purchase) => {
                if (explicitPurchasesInFlight > 0) return;
                void fulfillExisting(purchase);
            });
            return true;
        } catch {
            connectPromise = null; // allow a later retry
            return false;
        }
    })();
    return connectPromise;
}

/**
 * Fetch localized store metadata for the given product ids so the UI can show
 * the price the store will actually charge (Apple/Google reject or dislike
 * hard-coded prices that differ from the store sheet). Safe to call often.
 */
export async function loadProducts(skus: string[]): Promise<void> {
    const m = load();
    if (!m || skus.length === 0) return;
    await initIap();
    try {
        const list = await m.fetchProducts({ skus, type: 'in-app' });
        for (const p of list ?? []) products.set(p.id, p as Product);
    } catch {
        // Store unreachable / products not yet approved — UI falls back to
        // the server's reference price.
    }
}

/** Localized display price (e.g. "$4.99", "4,99 €") if the store told us. */
export function storePrice(productId: string): string | null {
    return products.get(productId)?.displayPrice ?? null;
}

class IapError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
        super(message);
        this.code = code;
    }
}

/** User cancelled the native purchase sheet — callers treat this as a no-op. */
export class IapCancelled extends Error {
    constructor() {
        super('Purchase cancelled');
    }
}

interface NativePurchase {
    payload: IapPayload;
    raw: Purchase;
}

const PURCHASE_TIMEOUT_MS = 120_000;

/** Turn a native Purchase into the receipt payload the server verifies. */
async function toPayload(p: Purchase): Promise<IapPayload> {
    const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
    let receipt: string | undefined;
    if (platform === 'ios') {
        const m = load();
        // Legacy base64 App Store receipt for the server's /verifyReceipt call;
        // fall back to the unified token if the receipt file isn't present yet.
        const legacy = m?.getReceiptDataIOS ? await m.getReceiptDataIOS().catch(() => null) : null;
        receipt = legacy || p.purchaseToken || undefined;
    } else {
        receipt = p.purchaseToken || undefined;
    }
    return {
        platform,
        receipt,
        transactionId: p.transactionId ?? p.id,
    };
}

function isPending(p: Purchase): boolean {
    return String(p.purchaseState ?? '').toLowerCase() === 'pending';
}

/**
 * Drive a single native purchase to completion. Resolves when the store
 * delivers the matching transaction; rejects on error or cancellation. Does
 * NOT finish the transaction — the caller finishes only after the server has
 * granted the entitlement, so an interrupted grant is retried on next launch.
 */
async function requestNativePurchase(productId: string): Promise<NativePurchase> {
    const m = load();
    if (!m) throw new IapError('In-app purchases are not available here.');
    await initIap();
    explicitPurchasesInFlight += 1;

    return new Promise<NativePurchase>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            updateSub.remove();
            errorSub.remove();
            explicitPurchasesInFlight = Math.max(0, explicitPurchasesInFlight - 1);
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new IapError('The purchase timed out. If you were charged, use Restore Purchases.'));
        }, PURCHASE_TIMEOUT_MS);

        const updateSub = m.purchaseUpdatedListener((purchase) => {
            if (settled || purchase.productId !== productId) return;
            if (isPending(purchase)) return; // e.g. Ask to Buy — resolves later
            settled = true;
            cleanup();
            toPayload(purchase)
                .then((payload) => resolve({ payload, raw: purchase }))
                .catch((e) => reject(e instanceof Error ? e : new IapError('Receipt read failed')));
        });

        const errorSub = m.purchaseErrorListener((err) => {
            if (settled) return;
            settled = true;
            cleanup();
            // expo-iap normalizes user cancellation to the 'user-cancelled' code.
            if (err.code === 'user-cancelled') reject(new IapCancelled());
            else reject(new IapError(err.message || 'Purchase failed', err.code));
        });

        m.requestPurchase({
            request: { apple: { sku: productId }, google: { skus: [productId] } },
            type: 'in-app',
        }).catch((e: unknown) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(e instanceof Error ? e : new IapError('Could not start purchase'));
        });
    });
}

async function finish(raw: Purchase, isConsumable: boolean): Promise<void> {
    const m = load();
    if (!m) return;
    try {
        await m.finishTransaction({ purchase: raw, isConsumable });
    } catch {
        // Non-fatal: the transaction stays pending and reconciles next launch.
    }
}

/**
 * The core orchestration: native purchase → server grant → finish. When native
 * IAP is unavailable (Expo Go / simulator) it falls back to a receipt-less
 * server call, which grants directly while IAP_ENFORCE is off. `call` performs
 * the server request and MUST throw on failure (so we don't finish the txn).
 */
async function runPurchase<T>(args: {
    productId: string;
    consumable: boolean;
    call: (payload: IapPayload) => Promise<T>;
}): Promise<T> {
    if (!iapAvailable()) {
        return args.call({});
    }
    const { payload, raw } = await requestNativePurchase(args.productId);
    const result = await args.call(payload); // throws → txn left unfinished
    await finish(raw, args.consumable);
    return result;
}

// ─── Public purchase API ─────────────────────────────────────────────────────

export function purchaseRemoveAds() {
    return runPurchase({
        productId: REMOVE_ADS_PRODUCT_ID,
        consumable: false,
        call: (payload) => adsApi.removeAdsPurchase(payload),
    });
}

/** Per-season unlock → consumable so it can be bought again next season. */
export function purchaseBattlePass() {
    return runPurchase({
        productId: BATTLE_PASS_PRODUCT_ID,
        consumable: true,
        call: (payload) => battlePassApi.upgradePremium(payload),
    });
}

export function purchaseCosmetic(cosmeticId: string) {
    return runPurchase({
        productId: cosmeticProductId(cosmeticId),
        consumable: false,
        call: (payload) => cosmeticsApi.purchase(cosmeticId, payload),
    });
}

/** Coin packs are consumables (can be re-bought). */
export function purchaseCoinPack(packId: string) {
    return runPurchase({
        productId: coinPackProductId(packId),
        consumable: true,
        call: (payload) => coinsApi.purchase(packId, payload),
    });
}

// ─── Restore / reconcile ─────────────────────────────────────────────────────

/** Map a store product id back to the server grant + whether it's consumable. */
function endpointForProduct(
    productId: string
): { consumable: boolean; call: (p: IapPayload) => Promise<unknown> } | null {
    if (productId === REMOVE_ADS_PRODUCT_ID)
        return { consumable: false, call: (p) => adsApi.removeAdsPurchase(p) };
    if (productId === BATTLE_PASS_PRODUCT_ID)
        return { consumable: true, call: (p) => battlePassApi.upgradePremium(p) };
    if (productId.startsWith(`${PRODUCT_PREFIX}.cosmetic.`)) {
        const id = productId.slice(`${PRODUCT_PREFIX}.cosmetic.`.length);
        return { consumable: false, call: (p) => cosmeticsApi.purchase(id, p) };
    }
    if (productId.startsWith(`${PRODUCT_PREFIX}.coins.`)) {
        const packId = productId.slice(`${PRODUCT_PREFIX}.coins.`.length);
        return { consumable: true, call: (p) => coinsApi.purchase(packId, p) };
    }
    return null;
}

/**
 * Send one store-held purchase to the server and finish it. The server is
 * idempotent per transaction id: a purchase THIS account already redeemed
 * answers 200 (nothing re-granted), one redeemed by ANOTHER account answers
 * 409 — finished either way so it stops replaying. Any other failure (network,
 * pending state, verification outage) leaves the transaction unfinished so
 * the store re-delivers it later. Returns true when the server accepted it.
 */
async function fulfillExisting(p: Purchase): Promise<boolean> {
    const endpoint = endpointForProduct(p.productId);
    if (!endpoint || isPending(p)) return false;
    try {
        const payload = await toPayload(p);
        await endpoint.call(payload);
        await finish(p, endpoint.consumable);
        return true;
    } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
            await finish(p, endpoint.consumable);
        }
        return false;
    }
}

/**
 * Reconcile every purchase the store still holds for this account: RESTORES
 * non-consumable entitlements (Remove Ads, cosmetics) and RECOVERS purchases
 * that were charged but interrupted before the server granted them (an
 * unconsumed Play purchase auto-refunds after 3 days, so this matters).
 * Silent — runs at launch once signed in. Returns the number accepted.
 */
export async function reconcilePurchases(): Promise<number> {
    const m = load();
    if (!m) return 0;
    if (!(await initIap())) return 0;
    let purchases: Purchase[] = [];
    try {
        // iOS: current entitlements only (non-consumables + UNFINISHED
        // consumables) rather than the full StoreKit history, so we don't
        // re-send every coin pack ever bought on each launch.
        purchases = await m.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    } catch {
        return 0;
    }
    let accepted = 0;
    for (const p of purchases) {
        if (await fulfillExisting(p)) accepted += 1;
    }
    return accepted;
}

/**
 * User-triggered "Restore Purchases" (App Store 3.1.1 requires the button for
 * non-consumables). Asks the store to sync the account's history first, then
 * reconciles. Returns the number of purchases the server accepted.
 */
export async function restorePurchases(): Promise<number> {
    const m = load();
    if (!m) return 0;
    if (!(await initIap())) return 0;
    try {
        await m.restorePurchases();
    } catch {
        // iOS sync can fail offline / when the user cancels the Apple ID
        // prompt — getAvailablePurchases still returns what's cached.
    }
    return reconcilePurchases();
}
