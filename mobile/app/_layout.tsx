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
import { useAuthStore } from '../src/store/authStore';
import { useGameStore } from '../src/store/gameStore';
import { initAds } from '../src/ads';
import { makeThemedStyles, colors, useThemeStore, type ThemeId } from '../src/theme/colors';

const THEME_STORAGE_KEY = 'wordwar.theme';

function useAuthGate() {
    const router = useRouter();
    const segments = useSegments();
    const hydrated = useAuthStore((s) => s.hydrated);
    const token = useAuthStore((s) => s.token);

    useEffect(() => {
        if (!hydrated) return;
        const inAuthGroup = segments[0] === '(auth)';
        if (!token && !inAuthGroup) {
            router.replace('/(auth)/welcome');
        } else if (token && inAuthGroup) {
            router.replace('/(app)');
        }
    }, [hydrated, token, segments, router]);
}

export default function RootLayout() {
    const hydrate = useAuthStore((s) => s.hydrate);
    const hydrated = useAuthStore((s) => s.hydrated);
    const token = useAuthStore((s) => s.token);
    const connectPersistent = useGameStore((s) => s.connectPersistent);
    // Subscribe to theme bump so root + children re-render when the theme
    // changes. We never read the bump value — we just want the re-render.
    useThemeStore((s) => s.bump);
    const applyTheme = useThemeStore((s) => s.applyTheme);

    useEffect(() => {
        hydrate();
        // Restore saved theme — persisted across app launches via SecureStore.
        SecureStore.getItemAsync(THEME_STORAGE_KEY)
            .then((stored) => {
                if (stored) applyTheme(stored as ThemeId);
            })
            .catch(() => {});
        initAds().catch(() => {});
    }, [hydrate, applyTheme]);

    // Open the persistent socket as soon as we have a token. This keeps a
    // live connection for the whole session so friend challenges can reach
    // the player even when they're idle on the home screen.
    useEffect(() => {
        if (token) connectPersistent(token);
    }, [token, connectPersistent]);

    useAuthGate();

    if (!hydrated) {
        return (
            <View style={styles.loadingScreen}>
                <ActivityIndicator color={colors.primary} size="large" />
            </View>
        );
    }

    return (
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
