// Dynamic Expo config. Starts from app.json and layers on everything that is
// environment-specific or store-compliance-critical, so a production build can
// never silently ship placeholder/test values.
//
//   • AdMob APP ids come from env (ADMOB_IOS_APP_ID / ADMOB_ANDROID_APP_ID);
//     Google's sample ids are used ONLY outside production builds.
//   • A production EAS build fails fast if any required release env is missing.
//   • iOS: Sign in with Apple ON (required by App Store 4.8 because we offer
//     Google login), full-screen on iPad (portrait-only apps that support
//     multitasking are rejected with ITMS-90474), privacy manifest for the
//     first-party data we collect.
//   • Android: strip permissions we don't use so the Play listing stays clean.
//   • The bundle id / package is registered as a URL scheme for the native
//     Google Sign-In redirect (`<applicationId>:/oauthredirect`).

import type { ConfigContext, ExpoConfig } from 'expo/config';

const ADMOB_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const ADMOB_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const APP_ID = 'dev.bonhomieinc.wordwar';
const VERSION = '1.0.0';

const isProductionBuild = process.env.EAS_BUILD_PROFILE === 'production';

function requireProdEnv(names: string[]): void {
    const missing = names.filter((n) => !process.env[n]);
    if (missing.length) {
        throw new Error(
            `[app.config] Production build is missing required env: ${missing.join(', ')}. ` +
                'Set them in eas.json (production.env) or as EAS environment variables.'
        );
    }
}

if (isProductionBuild) {
    requireProdEnv([
        'EXPO_PUBLIC_API_URL',
        'ADMOB_IOS_APP_ID',
        'ADMOB_ANDROID_APP_ID',
        'EXPO_PUBLIC_ADMOB_BANNER_IOS_ID',
        'EXPO_PUBLIC_ADMOB_BANNER_ANDROID_ID',
        'EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS_ID',
        'EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID',
        'EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID',
        'EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID',
    ]);
    if (!/^https:\/\//.test(process.env.EXPO_PUBLIC_API_URL ?? '')) {
        throw new Error('[app.config] EXPO_PUBLIC_API_URL must be an https:// URL in production.');
    }
    if ((process.env.ADMOB_IOS_APP_ID ?? '').includes('3940256099942544')) {
        throw new Error('[app.config] ADMOB_IOS_APP_ID is Google\'s sample id — use your real AdMob app id.');
    }
    if ((process.env.ADMOB_ANDROID_APP_ID ?? '').includes('3940256099942544')) {
        throw new Error('[app.config] ADMOB_ANDROID_APP_ID is Google\'s sample id — use your real AdMob app id.');
    }
}

const admobIosAppId = process.env.ADMOB_IOS_APP_ID || ADMOB_TEST_IOS_APP_ID;
const admobAndroidAppId = process.env.ADMOB_ANDROID_APP_ID || ADMOB_TEST_ANDROID_APP_ID;

export default ({ config }: ConfigContext): ExpoConfig => {
    const plugins: NonNullable<ExpoConfig['plugins']> = (config.plugins ?? []).map((p) => {
        if (Array.isArray(p) && p[0] === 'react-native-google-mobile-ads') {
            return [
                p[0],
                { ...(p[1] as object), androidAppId: admobAndroidAppId, iosAppId: admobIosAppId },
            ] as [string, unknown];
        }
        return p;
    });
    // Keep every pod buildable on current Xcode (see plugins/withPodDeploymentTarget.js).
    plugins.push('./plugins/withPodDeploymentTarget.js');

    return {
        ...config,
        name: config.name ?? 'WordWar',
        slug: config.slug ?? 'wordwar',
        version: VERSION,
        scheme: ['wordwar', APP_ID],
        plugins,
        ios: {
            ...config.ios,
            bundleIdentifier: APP_ID,
            buildNumber: '1',
            supportsTablet: true,
            // Portrait-only + iPad requires opting out of multitasking, or
            // App Store Connect rejects the binary (ITMS-90474).
            requireFullScreen: true,
            usesAppleSignIn: true,
            entitlements: {
                ...(config.ios?.entitlements ?? {}),
                'com.apple.developer.applesignin': ['Default'],
            },
            infoPlist: {
                ...(config.ios?.infoPlist ?? {}),
                ITSAppUsesNonExemptEncryption: false,
                NSUserTrackingUsageDescription:
                    'This identifier will be used to deliver personalized ads to you.',
            },
            // First-party data collection for the App Privacy report. SDKs
            // (AdMob, Expo modules) ship their own manifests which Xcode merges.
            privacyManifests: {
                NSPrivacyTracking: true,
                NSPrivacyTrackingDomains: [],
                NSPrivacyCollectedDataTypes: [
                    collected('NSPrivacyCollectedDataTypeUserID'),
                    collected('NSPrivacyCollectedDataTypeEmailAddress'),
                    collected('NSPrivacyCollectedDataTypeDeviceID'),
                    collected('NSPrivacyCollectedDataTypePurchaseHistory'),
                    collected('NSPrivacyCollectedDataTypeGameplayContent'),
                    collected('NSPrivacyCollectedDataTypeUserID'),
                ].filter((v, i, a) => a.findIndex((x) => x.NSPrivacyCollectedDataType === v.NSPrivacyCollectedDataType) === i),
            },
        },
        android: {
            ...config.android,
            package: APP_ID,
            versionCode: 1,
            blockedPermissions: [
                'android.permission.READ_EXTERNAL_STORAGE',
                'android.permission.WRITE_EXTERNAL_STORAGE',
                'android.permission.SYSTEM_ALERT_WINDOW',
            ],
        },
    };
};

function collected(type: string) {
    return {
        NSPrivacyCollectedDataType: type,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    };
}
