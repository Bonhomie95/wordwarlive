// Matchmaking screen. Shared by classic AND mystery - the difference is
// just a `?mode=classic|mystery` query param.
//
// IMPORTANT FIX: this screen used to kick off the queue from a
// `useEffect(() => {...}, [])` (run-once-on-mount). But expo-router keeps
// screens mounted once visited - so on the 2nd, 3rd... visit the effect
// never ran again. Result: "Play Again" / re-entering matchmaking did
// nothing, the phase stayed 'idle', and the idle-bounce shoved the player
// back home.
//
// The fix is `useFocusEffect`: it fires every time the screen GAINS
// FOCUS, so every visit re-queues with the (persistent) socket.

import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
    useFocusEffect,
    useLocalSearchParams,
    useRouter,
} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui/Button';
import { useGameStore } from '../../src/store/gameStore';
import { useAuthStore } from '../../src/store/authStore';
import { colors, makeThemedStyles } from '../../src/theme/colors';
import { typography, spacing } from '../../src/theme/typography';

export default function Matchmaking() {
    const router = useRouter();
    const params = useLocalSearchParams<{ mode?: string }>();
    const mode: 'classic' | 'mystery' =
        params.mode === 'mystery' ? 'mystery' : 'classic';

    const phase = useGameStore((s) => s.phase);
    const queueStatus = useGameStore((s) => s.queueStatus);
    const leaveQueue = useGameStore((s) => s.leaveQueue);
    const connectAndQueue = useGameStore((s) => s.connectAndQueue);
    const token = useAuthStore((s) => s.token);

    // True only while this screen is the focused one. The idle-bounce
    // gates on it so a blurred-but-still-mounted matchmaking screen can't
    // hijack navigation (e.g. when post-game resets the phase to idle).
    const focusedRef = useRef(false);
    // Set once the queue has actually started, so the idle-bounce only
    // fires on a real queue -> idle transition (cancel / rejection), not
    // on the brief idle moment before connectAndQueue runs.
    const queueStartedRef = useRef(false);

    // Re-queue every time the screen gains focus. This is the crux of the
    // "play again does nothing / bounces home" fix.
    useFocusEffect(
        useCallback(() => {
            focusedRef.current = true;
            queueStartedRef.current = false;
            if (!token) {
                router.navigate('/(app)');
                return () => {
                    focusedRef.current = false;
                };
            }
            // connectAndQueue resets match state, reuses the persistent
            // socket, and queues - safe to call on every focus.
            connectAndQueue(token, mode);
            return () => {
                focusedRef.current = false;
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [token, mode])
    );

    useEffect(() => {
        if (phase === 'queueing' || phase === 'matched' || phase === 'playing') {
            queueStartedRef.current = true;
        }
    }, [phase]);

    // Queue cancelled / rejected -> go home. Gated on focus.
    // (Matched -> match-screen navigation is handled globally by
    // MatchAutoRouter in app/(app)/_layout.tsx so it works for friend
    // challenges too.)
    useEffect(() => {
        if (focusedRef.current && phase === 'idle' && queueStartedRef.current) {
            router.navigate('/(app)');
        }
    }, [phase, router]);

    const waited = Math.floor((queueStatus?.waitedMs ?? 0) / 1000);
    const headline =
        queueStatus?.state === 'matching_with_bot'
            ? 'Opponent found!'
            : queueStatus?.state === 'expanded_search'
            ? 'Looking further afield…'
            : mode === 'mystery'
            ? 'Searching for a mystery opponent…'
            : 'Searching for an opponent…';
    const sub =
        queueStatus?.state === 'matching_with_bot'
            ? 'Get ready — your match is starting.'
            : mode === 'mystery'
            ? 'Finding someone with a same-length word.'
            : "We're finding someone close to your rank.";

    function onCancel() {
        leaveQueue();
        router.navigate('/(app)');
    }

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.body}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.headline} allowFontScaling={false}>
                    {headline}
                </Text>
                <Text style={styles.sub} allowFontScaling={false}>{sub}</Text>
                <Text style={styles.timer} allowFontScaling={false}>
                    {`${waited}s`}
                </Text>
            </View>
            <View style={styles.footer}>
                <Button label="Cancel" onPress={onCancel} variant="ghost" />
            </View>
        </SafeAreaView>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
    body: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
    },
    headline: {
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        textAlign: 'center',
    },
    sub: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        textAlign: 'center',
        marginTop: -spacing.sm,
    },
    timer: {
        color: colors.textDim,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.xl,
        marginTop: spacing.sm,
    },
    footer: {
        marginBottom: spacing.lg,
    },
}));
