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

export type RewardedSlot = 'daily_bonus' | 'bp_xp_boost';

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
            opts: { serverSideVerificationOptions?: { customData?: string } }
        ) => RewardedAdInstance;
    };
    InterstitialAd: {
        createForAdRequest: (unitId: string) => InterstitialAdInstance;
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

/**
 * Show a rewarded ad. Resolves once the user dismisses it (whether they
 * earned the reward or not).
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
            serverSideVerificationOptions: {
                customData: `${userId}|${slot}`,
            },
        });

        let earned = false;
        let resolved = false;
        const finish = (r: RewardedShowResult) => {
            if (resolved) return;
            resolved = true;
            offLoaded?.();
            offReward?.();
            offClosed?.();
            offError?.();
            resolve(r);
        };

        const offLoaded = ad.addAdEventListener(m.RewardedAdEventType.LOADED, () => {
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
        const ad = m.InterstitialAd.createForAdRequest(unitId);
        let resolved = false;
        const done = () => {
            if (resolved) return;
            resolved = true;
            offLoaded?.();
            offError?.();
            offClosed?.();
            resolve();
        };
        const timer = setTimeout(done, INTERSTITIAL_LOAD_TIMEOUT_MS);

        const offLoaded = ad.addAdEventListener(m.AdEventType.LOADED, () => {
            clearTimeout(timer);
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
