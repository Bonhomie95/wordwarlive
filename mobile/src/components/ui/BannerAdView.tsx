// Adaptive banner ad anchored to the bottom. Visible on every screen
// that has the (app) tab navigator chrome.
//
// Renders nothing if:
//   • the native ads module isn't available (Expo Go);
//   • the user has purchased Remove Ads.

import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '../../store/authStore';
import { adsAvailable } from '../../ads';
import { colors } from '../../theme/colors';

interface AdsModule {
    BannerAd: React.ComponentType<{
        unitId: string;
        size: string;
        requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
        onAdFailedToLoad?: (err: unknown) => void;
    }>;
    BannerAdSize: {
        ANCHORED_ADAPTIVE_BANNER: string;
    };
    TestIds: {
        ADAPTIVE_BANNER: string;
    };
}

let mod: AdsModule | null = null;
function loadModule(): AdsModule | null {
    if (mod) return mod;
    if (Constants.executionEnvironment === 'storeClient') return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('react-native-google-mobile-ads') as AdsModule;
        return mod;
    } catch {
        return null;
    }
}

function bannerUnitId(m: AdsModule): string {
    if (__DEV__) return m.TestIds.ADAPTIVE_BANNER;
    const ios = process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS_ID;
    const android = process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID_ID;
    return Platform.OS === 'ios' ? ios ?? '' : android ?? '';
}

export const BannerAdView: React.FC = () => {
    const user = useAuthStore((s) => s.user);
    const adsRemoved = user && 'ads' in user ? user.ads.removed : false;
    if (adsRemoved) return null;
    if (!adsAvailable()) return null;

    const m = loadModule();
    if (!m) return null;

    const unitId = bannerUnitId(m);
    if (!unitId) return null;

    return (
        <View style={styles.container} pointerEvents="box-none">
            <m.BannerAd
                unitId={unitId}
                size={m.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                requestOptions={{ requestNonPersonalizedAdsOnly: false }}
                onAdFailedToLoad={() => {
                    // Quiet — banners failing to load is normal during dev
                    // and for users with no available ads.
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.bg,
        alignItems: 'center',
        // Visual divider so the ad doesn't blend into content.
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
});
