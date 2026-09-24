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

/** How long we wait for a rewarded ad to LOAD before giving up. Without
 *  this, a network/AdMob outage left the promise pending forever — and the
 *  blocking AdLoadingOverlay with it, freezing the whole screen. */
const REWARDED_LOAD_TIMEOUT_MS = 12_000;

/** Last-resort watchdog AFTER show() is called. If AdMob never fires
 *  CLOSED or ERROR (seen with mid-play SDK errors / activity teardown),
 *  the promise would hang and the caller's blocking overlay would stay up
 *  forever. A rewarded ad + end card is well under 3 minutes; if we're
 *  still pending by then, settle so the UI is guaranteed to unfreeze.
 *  (If the user did earn, the server-side SSV callback still grants it.) */
const SHOW_WATCHDOG_MS = 180_000;

/**
 * Show a rewarded ad. ALWAYS resolves: when the user dismisses the ad,
 * when it errors, or when loading times out — so callers can safely keep
 * a blocking overlay up until this settles.
 *
 * customData = "<userId>|<slot>" lets AdMob's SSV callback route the reward
 * server-side without trusting the client.
 */
export async function showRewarded(
    slot: RewardedSlot,
    userId: string
): Promise<RewardedShowResult> {
    const m = loadModule();
    if (!m) return { earned: false, unavailable: true };
    await initAds();
    const unitId = rewardedUnitId();
    if (!unitId) {
        return { earned: false, unavailable: true, error: 'No ad unit configured' };
    }

    return new Promise<RewardedShowResult>((resolve) => {
        const ad = m.RewardedAd.createForAdRequest(unitId, {
            ...adRequestOptions(),
            serverSideVerificationOptions: {
                customData: `${userId}|${slot}`,
            },
        });

        let earned = false;
        let resolved = false;
        let showWatchdog: ReturnType<typeof setTimeout> | null = null;
        const finish = (r: RewardedShowResult) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(loadTimer);
            if (showWatchdog) clearTimeout(showWatchdog);
            offLoaded?.();
            offReward?.();
            offClosed?.();
            offError?.();
            resolve(r);
        };

        // Give up if the ad hasn't loaded in time (offline, AdMob down…).
        // Once it HAS loaded and is showing, the timer no longer applies —
        // the user can watch at their own pace.
        const loadTimer = setTimeout(() => {
            finish({
                earned: false,
                unavailable: false,
                error: 'Ad took too long to load. Check your connection and try again.',
            });
        }, REWARDED_LOAD_TIMEOUT_MS);

        const offLoaded = ad.addAdEventListener(m.RewardedAdEventType.LOADED, () => {
            clearTimeout(loadTimer);
            showWatchdog = setTimeout(() => {
                finish({ earned, unavailable: false });
            }, SHOW_WATCHDOG_MS);
            ad.show().catch((err: unknown) => {
                finish({
                    earned: false,
                    unavailable: false,
                    error: err instanceof Error ? err.message : 'show failed',
                });
            });
        });
        const offReward = ad.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => {
            earned = true;
        });
        const offClosed = ad.addAdEventListener(m.AdEventType.CLOSED, () => {
            finish({ earned, unavailable: false });
        });
        const offError = ad.addAdEventListener(m.AdEventType.ERROR, (err) => {
            finish({
                earned: false,
                unavailable: false,
                error: (err as { message?: string } | undefined)?.message ?? 'ad error',
            });
        });

        try {
            ad.load();
        } catch (err) {
            finish({
                earned: false,
                unavailable: false,
                error: err instanceof Error ? err.message : 'load failed',
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
