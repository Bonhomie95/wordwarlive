// Root layout. Hydrates the auth store from secure storage on mount, then
// gates the (auth) and (app) groups based on token presence. Expo Router's
// Redirect component handles the bounce.

import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import {
    useFonts,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { useAuthStore } from '../src/store/authStore';
import { useGameStore } from '../src/store/gameStore';
import { initAds } from '../src/ads';
import { initIap, reconcilePurchases } from '../src/iap';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { initObservability } from '../src/observability';
import { restoreHapticsPref } from '../src/lib/haptics';
import { registerForPush, onNotificationResponse } from '../src/lib/notifications';
import { makeThemedStyles, colors, useThemeStore, type ThemeId } from '../src/theme/colors';

const THEME_STORAGE_KEY = 'wordwar.theme';

function useAuthGate() {
    const router = useRouter();
    const segments = useSegments();
    const hydrated = useAuthStore((s) => s.hydrated);
    const token = useAuthStore((s) => s.token);
    const suspended = useAuthStore((s) => s.suspended);

    useEffect(() => {
        if (!hydrated) return;
        // `segments` is a typed tuple whose length varies with the generated
        // route types; read it as a plain string[] so deeper indices typecheck.
        const segs = segments as readonly string[];
        // A suspended account is corralled onto the suspended screen and kept
        // out of both the app and the normal auth flow, regardless of token.
        if (suspended) {
            if (segs[1] !== 'suspended') {
                router.replace('/(auth)/suspended');
            }
            return;
        }
        const inAuthGroup = segs[0] === '(auth)';
        if (!token && !inAuthGroup) {
            router.replace('/(auth)/welcome');
        } else if (token && inAuthGroup) {
            router.replace('/(app)');
        }
    }, [hydrated, token, suspended, segments, router]);
}

export default function RootLayout() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({
        SpaceGrotesk_500Medium,
        SpaceGrotesk_600SemiBold,
        SpaceGrotesk_700Bold,
        SpaceMono_400Regular,
        SpaceMono_700Bold,
    });
    const hydrate = useAuthStore((s) => s.hydrate);
    const hydrated = useAuthStore((s) => s.hydrated);
    const token = useAuthStore((s) => s.token);
    const connectPersistent = useGameStore((s) => s.connectPersistent);
    // Subscribe to theme bump so root + children re-render when the theme
    // changes. We never read the bump value — we just want the re-render.
    useThemeStore((s) => s.bump);
    const applyTheme = useThemeStore((s) => s.applyTheme);

    useEffect(() => {
        initObservability();
        hydrate();
        restoreHapticsPref();
        // Restore saved theme — persisted across app launches via SecureStore.
        SecureStore.getItemAsync(THEME_STORAGE_KEY)
            .then((stored) => {
                if (stored) applyTheme(stored as ThemeId);
            })
            .catch(() => {});
        initAds().catch(() => {});
        // Open the billing connection so the store is ready by the time the
        // user reaches the shop (no-op in Expo Go / on the simulator).
        initIap().catch(() => {});
    }, [hydrate, applyTheme]);

    // Open the persistent socket as soon as we have a token. This keeps a
    // live connection for the whole session so friend challenges can reach
    // the player even when they're idle on the home screen. Also register
    // this device for push so challenges reach a backgrounded app.
    useEffect(() => {
        if (token) {
            connectPersistent(token);
            // Silent: registers only if permission is already granted. The
            // prompt itself is shown in context on the Friends screen.
            registerForPush({ prompt: false }).catch(() => {});
            // Fulfil anything the store still holds for this account (an
            // interrupted purchase, a non-consumable to restore). Idempotent.
            reconcilePurchases().catch(() => {});
        }
    }, [token, connectPersistent]);

    // Tapping a friend-challenge push routes the player to the app so the
    // in-app prompt (driven by the socket event) can be answered.
    useEffect(() => {
        const unsub = onNotificationResponse((data) => {
            if (data?.type === 'friend_challenge') {
                router.navigate('/(app)');
            }
        });
        return unsub;
    }, [router]);

    useAuthGate();

    if (!hydrated || !fontsLoaded) {
        return (
            <View style={styles.loadingScreen}>
                <ActivityIndicator color={colors.primary} size="large" />
            </View>
        );
    }

    return (
        <ErrorBoundary>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
                <SafeAreaProvider>
                    <StatusBar style="light" />
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: colors.bg },
                            animation: 'fade',
                        }}
                    >
                        <Stack.Screen name="(auth)" />
                        <Stack.Screen name="(app)" />
                    </Stack>
                </SafeAreaProvider>
            </GestureHandlerRootView>
        </ErrorBoundary>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    loadingScreen: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));
