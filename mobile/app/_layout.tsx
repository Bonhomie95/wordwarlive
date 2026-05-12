// Root layout. Hydrates the auth store from secure storage on mount, then
// gates the (auth) and (app) groups based on token presence. Expo Router's
// Redirect component handles the bounce.

import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/store/authStore';
import { initAds } from '../src/ads';
import { colors } from '../src/theme/colors';

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

    useEffect(() => {
        hydrate();
        // Kick off ads SDK initialization in parallel — safe no-op in Expo Go.
        initAds().catch(() => {});
    }, [hydrate]);

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

const styles = StyleSheet.create({
    loadingScreen: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
