// Ad service. Wraps react-native-google-mobile-ads and exposes:
//   • initAds()         — call once at app start
//   • showRewarded(slot, userId)  — returns a Promise that resolves when the
//     user has watched the ad (and AdMob has fired its SSV callback). The
//     server is the source of truth for granted rewards; this hook just
//     starts the ad and tells the caller when AdMob says "earned".
//   • showInterstitial() — best-effort fire-and-forget
//
// IMPORTANT: native modules can't load in Expo Go. We detect Expo Go via
// expo-constants and short-circuit BEFORE attempting to require the package
// — without that guard, requiring the package triggers a TurboModule
// Invariant Violation that bubbles past JS try/catch (it's thrown from the
// native bridge layer).

import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type RewardedSlot = 'daily_bonus' | 'bp_xp_boost' | 'coin_boost';

interface AdsModule {
    default: {
        (): {
            initialize: () => Promise<unknown>;
            setRequestConfiguration: (cfg: unknown) => Promise<unknown>;
        };
    };
    RewardedAd: {
        createForAdRequest: (
            unitId: string,
            opts: {
                requestNonPersonalizedAdsOnly?: boolean;
                serverSideVerificationOptions?: { customData?: string };
            }
        ) => RewardedAdInstance;
    };
    InterstitialAd: {
        createForAdRequest: (
            unitId: string,
            opts?: { requestNonPersonalizedAdsOnly?: boolean }
        ) => InterstitialAdInstance;
    };
    RewardedAdEventType: {
        LOADED: string;
        EARNED_REWARD: string;
    };
    AdEventType: {
        LOADED: string;
        ERROR: string;
        CLOSED: string;
        OPENED: string;
    };
    TestIds: {
        REWARDED: string;
        INTERSTITIAL: string;
    };
    MaxAdContentRating: { T: string };
    AdsConsent: {
        gatherConsent: (opts?: unknown) => Promise<ConsentInfo>;
        getConsentInfo: () => Promise<ConsentInfo>;
        showPrivacyOptionsForm: () => Promise<ConsentInfo>;
    };
}

interface ConsentInfo {
    status: string;
    canRequestAds: boolean;
    /** 'REQUIRED' when regulations (GDPR/UK/US-state) entitle the user to
     *  re-open the consent form from a settings entry point. */
    privacyOptionsRequirementStatus: string;
}

interface RewardedAdInstance {
    addAdEventListener: (event: string, listener: (e?: unknown) => void) => () => void;
    load: () => void;
    show: () => Promise<void>;
}
interface InterstitialAdInstance {
    addAdEventListener: (event: string, listener: (e?: unknown) => void) => () => void;
    load: () => void;
    show: () => Promise<void>;
}

let mod: AdsModule | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

// Personalization gate.
//   iOS: App Tracking Transparency (Apple 5.1.2) — until the user grants ATT we
//        request non-personalized ads only.
//   Android: no ATT; the UMP consent form (below) is what governs
//        personalization, and the SDK applies it on its own. Until consent has
//        been gathered we stay non-personalized as the safe default.
let nonPersonalizedOnly = true;

// UMP (Google User Messaging Platform) — the EEA/UK GDPR + US-state consent
// form Google requires before serving ads there. Users elsewhere never see it.
let privacyOptionsRequired = false;

/**
 * Ask for App Tracking Transparency (iOS only), once, before ads initialize.
 * Safe in Expo Go / when the module is absent — it just leaves us in the
 * non-personalized state. Never throws.
 */
async function requestTrackingIfNeeded(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const att = require('expo-tracking-transparency') as {
            requestTrackingPermissionsAsync: () => Promise<{ granted: boolean }>;
        };
        const { granted } = await att.requestTrackingPermissionsAsync();
        nonPersonalizedOnly = !granted;
    } catch {
        nonPersonalizedOnly = true;
    }
}

/**
 * Gather regulatory consent through UMP (shows Google's consent form where
 * required). Never throws — if consent gathering fails Google's guidance is to
 * still request ads.
 */
async function gatherConsentIfNeeded(m: AdsModule): Promise<void> {
    try {
        const info = await m.AdsConsent.gatherConsent();
        privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        if (Platform.OS === 'android') nonPersonalizedOnly = false; // UMP decides
    } catch {
        // Ads still load (non-personalized where consent is unknown).
    }
}

/** Request options applied to every ad load. */
export function adRequestOptions(): { requestNonPersonalizedAdsOnly: boolean } {
    return { requestNonPersonalizedAdsOnly: nonPersonalizedOnly };
}

/** True when the user is entitled to re-open the ads consent form (GDPR/UK/
 *  US-state). Settings shows a "Privacy options" row in that case. */
export function adPrivacyOptionsRequired(): boolean {
    return privacyOptionsRequired;
}

/** Re-open the UMP privacy-options form. No-op when the module is absent. */
export async function showAdPrivacyOptions(): Promise<void> {
    const m = loadModule();
    if (!m) return;
    try {
        const info = await m.AdsConsent.showPrivacyOptionsForm();
        privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch {
        // form unavailable — nothing to do
    }
}

/**
 * Lazy-load the native module. Returns null in Expo Go (storeClient) or
 * if the require throws for any other reason.
 */
function loadModule(): AdsModule | null {
    if (mod) return mod;
    // Constants.executionEnvironment values:
    //   'storeClient' = Expo Go
    //   'standalone'  = production / TestFlight / Play
    //   'bare'        = custom dev client (npx expo run:ios/android)
    // Native modules only work in 'standalone' or 'bare'.
    if (Constants.executionEnvironment === 'storeClient') {
        return null;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('react-native-google-mobile-ads') as AdsModule;
        return mod;
    } catch {
        return null;
    }
}

export function adsAvailable(): boolean {
    return loadModule() !== null;
}

export async function initAds(): Promise<void> {
    if (initialized) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        const m = loadModule();
        if (!m) {
            initialized = true;
            return;
        }
        try {
            // ATT + regulatory consent must be resolved BEFORE the SDK
            // initializes so the first ad requests already honor the choice.
            await requestTrackingIfNeeded();
            await gatherConsentIfNeeded(m);
            // The app is rated 12+/Teen (user-generated names + words); never
            // pull mature ad creatives regardless of the AdMob account setting.
            await m
                .default()
                .setRequestConfiguration({ maxAdContentRating: m.MaxAdContentRating.T })
                .catch(() => {});
            await m.default().initialize();
            initialized = true;
        } catch {
            initialized = true; // don't keep retrying
        }
    })();
    return initPromise;
}

// ─── Ad unit IDs ────────────────────────────────────────────────────────────

function rewardedUnitId(): string {
    const m = loadModule();
    if (!m) return '';
    if (__DEV__) return m.TestIds.REWARDED;
    const ios = process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID;
    const android = process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID;
    return Platform.OS === 'ios' ? ios ?? '' : android ?? '';
}

function interstitialUnitId(): string {
    const m = loadModule();
    if (!m) return '';
    if (__DEV__) return m.TestIds.INTERSTITIAL;
    const ios = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID;
    const android = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID;
    return Platform.OS === 'ios' ? ios ?? '' : android ?? '';
}

// ─── Rewarded ads ───────────────────────────────────────────────────────────
//
// One ad per slot, kept across taps. `preloadRewarded` starts the fetch when
// the button appears; `showRewarded` reuses the same in-flight/loaded ad, so a
// tap never spawns a second parallel load and there is never more than one
// full-screen ad presented at a time (`presenting` guards rewarded AND
// interstitial). A load that outlives the tap-to-show wait keeps going in the
// background and is shown on the next tap.

export interface RewardedShowResult {
    /** True if AdMob fired EARNED_REWARD. The server reward grant runs on a
     *  separate path (SSV callback) — the client calling refresh after this
     *  is the standard pattern. */
    earned: boolean;
    /** True if the native module wasn't available (Expo Go). The caller can
     *  use this to show a "Try the dev client" message. */
    unavailable: boolean;
    error?: string;
}

/** How long a tap waits for the ad to be ready before giving up. The load
 *  itself keeps running so the next tap can use it. */
const REWARDED_SHOW_TIMEOUT_MS = 20_000;

/** Last-resort watchdog AFTER show() is called. If AdMob never fires
 *  CLOSED or ERROR (seen with mid-play SDK errors / activity teardown),
 *  the promise would hang and the caller's blocking overlay would stay up
 *  forever. A rewarded ad + end card is well under 3 minutes; if we're
 *  still pending by then, settle so the UI is guaranteed to unfreeze.
 *  (If the user did earn, the server-side SSV callback still grants it.) */
const SHOW_WATCHDOG_MS = 180_000;

interface SlotAd {
    ad: RewardedAdInstance;
    userId: string;
    state: 'loading' | 'loaded' | 'showing';
    earned: boolean;
    startedAt: number;
    waiters: ((r: RewardedShowResult) => void)[];
}

const slots = new Map<RewardedSlot, SlotAd>();
const PRELOAD_RETRY_MS = 30_000;
const preloadRetried = new Set<RewardedSlot>();
/** A full-screen ad (rewarded or interstitial) is on screen right now. */
let presenting = false;

function log(msg: string): void {
    const pad = Platform.OS === 'ios' && Platform.isPad ? '-pad' : '';
    if (__DEV__) console.log(`[ads:${Platform.OS}${pad}] ${msg}`);
}

/** Get the slot's current ad, creating + loading one if needed. */
function ensureSlotAd(m: AdsModule, slot: RewardedSlot, userId: string): SlotAd {
    const cur = slots.get(slot);
    if (cur && cur.userId === userId) return cur;

    const ad = m.RewardedAd.createForAdRequest(rewardedUnitId(), {
        ...adRequestOptions(),
        // customData = "<userId>|<slot>" lets AdMob's SSV callback route the
        // reward server-side without trusting the client.
        serverSideVerificationOptions: { customData: `${userId}|${slot}` },
    });
    const s: SlotAd = { ad, userId, state: 'loading', earned: false, startedAt: Date.now(), waiters: [] };
    slots.set(slot, s);

    const settle = (r: RewardedShowResult) => {
        if (slots.get(slot) === s) slots.delete(slot);
        if (s.state === 'showing') presenting = false;
        const w = s.waiters;
        s.waiters = [];
        w.forEach((fn) => fn(r));
    };
    ad.addAdEventListener(m.RewardedAdEventType.LOADED, () => {
        log(`${slot} loaded (+${Date.now() - s.startedAt}ms)`);
        preloadRetried.delete(slot);
        s.state = 'loaded';
        if (s.waiters.length) presentSlot(s, settle);
    });
    ad.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => {
        log(`${slot} earned`);
        s.earned = true;
    });
    ad.addAdEventListener(m.AdEventType.CLOSED, () => {
        log(`${slot} closed`);
        settle({ earned: s.earned, unavailable: false });
    });
    ad.addAdEventListener(m.AdEventType.ERROR, (err) => {
        const message = (err as { message?: string } | undefined)?.message ?? 'ad error';
        log(`${slot} error: ${message} (+${Date.now() - s.startedAt}ms)`);
        const background = s.waiters.length === 0 && s.state === 'loading';
        settle({ earned: false, unavailable: false, error: message });
        // A silent preload that failed (no fill / network) gets one delayed
        // retry so the ad is usually ready by the time the user taps.
        if (background && !preloadRetried.has(slot)) {
            preloadRetried.add(slot);
            setTimeout(() => preloadRewarded(slot, userId), PRELOAD_RETRY_MS);
        }
    });
    try {
        ad.load();
    } catch (err) {
        settle({ earned: false, unavailable: false, error: err instanceof Error ? err.message : 'load failed' });
    }
    return s;
}

function presentSlot(s: SlotAd, settle: (r: RewardedShowResult) => void): void {
    if (s.state !== 'loaded') return;
    if (presenting) {
        settle({ earned: false, unavailable: false, error: 'Another ad is already showing.' });
        return;
    }
    presenting = true;
    s.state = 'showing';
    const watchdog = setTimeout(() => settle({ earned: s.earned, unavailable: false }), SHOW_WATCHDOG_MS);
    s.waiters.push(() => clearTimeout(watchdog));
    s.ad.show().catch((err: unknown) => {
        settle({ earned: false, unavailable: false, error: err instanceof Error ? err.message : 'show failed' });
    });
}

/** Start loading the slot's ad in the background (call when its button
 *  becomes visible). Safe to call repeatedly; no-op without the module. */
export function preloadRewarded(slot: RewardedSlot, userId: string): void {
    const m = loadModule();
    if (!m) return;
    initAds()
        .then(() => {
            if (rewardedUnitId()) ensureSlotAd(m, slot, userId);
        })
        .catch(() => {});
}

/**
 * Show a rewarded ad. ALWAYS resolves: when the user dismisses the ad,
 * when it errors, or when the ready-wait times out — so callers can safely
 * keep a blocking overlay up until this settles.
 */
export async function showRewarded(
    slot: RewardedSlot,
    userId: string
): Promise<RewardedShowResult> {
    const m = loadModule();
    if (!m) return { earned: false, unavailable: true };
    await initAds();
    if (!rewardedUnitId()) {
        return { earned: false, unavailable: true, error: 'No ad unit configured' };
    }
    if (presenting) return { earned: false, unavailable: false };

    const s = ensureSlotAd(m, slot, userId);
    return new Promise<RewardedShowResult>((resolve) => {
        const timer = setTimeout(() => {
            log(`${slot} not ready after ${REWARDED_SHOW_TIMEOUT_MS}ms (loading ${Date.now() - s.startedAt}ms)`);
            s.waiters = s.waiters.filter((fn) => fn !== waiter);
            resolve({
                earned: false,
                unavailable: false,
                error: "The ad isn't ready yet. Please try again in a moment.",
            });
        }, REWARDED_SHOW_TIMEOUT_MS);
        const waiter = (r: RewardedShowResult) => {
            clearTimeout(timer);
            resolve(r);
        };
        s.waiters.push(waiter);
        if (s.state === 'loaded') {
            presentSlot(s, (r) => {
                if (slots.get(slot) === s) slots.delete(slot);
                presenting = false;
                const w = s.waiters;
                s.waiters = [];
                w.forEach((fn) => fn(r));
            });
        }
    });
}

// ─── Interstitial ads ───────────────────────────────────────────────────────
//
// Frequency-capped at the call site (gameStore decides when to fire). This
// helper just shows one cleanly with a load timeout so it doesn't hang the
// UI waiting for a slow network.

const INTERSTITIAL_LOAD_TIMEOUT_MS = 5000;

export async function showInterstitial(): Promise<void> {
    const m = loadModule();
    if (!m) return;
    await initAds();
    const unitId = interstitialUnitId();
    if (!unitId) return;

    return new Promise<void>((resolve) => {
        const ad = m.InterstitialAd.createForAdRequest(unitId, adRequestOptions());
        let resolved = false;
        let showWatchdog: ReturnType<typeof setTimeout> | null = null;
        const done = () => {
            if (resolved) return;
            resolved = true;
            if (showWatchdog) clearTimeout(showWatchdog);
            offLoaded?.();
            offError?.();
            offClosed?.();
            resolve();
        };
        const timer = setTimeout(done, INTERSTITIAL_LOAD_TIMEOUT_MS);

        const offLoaded = ad.addAdEventListener(m.AdEventType.LOADED, () => {
            clearTimeout(timer);
            // Same last-resort settle as showRewarded: if CLOSED/ERROR never
            // fire after show(), don't leave the caller's overlay up forever.
            showWatchdog = setTimeout(done, SHOW_WATCHDOG_MS);
            ad.show().catch(done);
        });
        const offError = ad.addAdEventListener(m.AdEventType.ERROR, () => {
            clearTimeout(timer);
            done();
        });
        const offClosed = ad.addAdEventListener(m.AdEventType.CLOSED, () => {
            clearTimeout(timer);
            done();
        });

        try {
            ad.load();
        } catch {
            clearTimeout(timer);
            done();
        }
    });
}
