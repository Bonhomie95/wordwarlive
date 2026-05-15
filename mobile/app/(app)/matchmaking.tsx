// Matchmaking screen. Shared by classic AND mystery — the difference is
// just a `?mode=classic|mystery` query param. The screen takes care of
// connecting + queueing on mount, so callers just route here.

import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui/Button';
import { useGameStore } from '../../src/store/gameStore';
import { useAuthStore } from '../../src/store/authStore';
import { colors } from '../../src/theme/colors';
import { typography, spacing } from '../../src/theme/typography';

export default function Matchmaking() {
    const router = useRouter();
    const params = useLocalSearchParams<{ mode?: string }>();
    const mode: 'classic' | 'mystery' =
        params.mode === 'mystery' ? 'mystery' : 'classic';

    const phase = useGameStore((s) => s.phase);
    const queueStatus = useGameStore((s) => s.queueStatus);
    const matchFound = useGameStore((s) => s.matchFound);
    const leaveQueue = useGameStore((s) => s.leaveQueue);
    const connectAndQueue = useGameStore((s) => s.connectAndQueue);
    const token = useAuthStore((s) => s.token);

    // Start queueing on mount. We only do this once per visit — the
    // dependency list intentionally excludes connectAndQueue/token so a
    // store identity change doesn't double-queue us. If the user is
    // already mid-queue (phase !== 'idle'), we let the existing socket
    // ride and just watch for match_found.
    useEffect(() => {
        if (!token) return;
        if (phase !== 'idle') return;
        connectAndQueue(token, mode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When we get matched, jump to the match screen.
    useEffect(() => {
        if ((phase === 'matched' || phase === 'playing') && matchFound) {
            router.replace('/(app)/match');
        }
    }, [phase, matchFound, router]);

    // If the user cancelled before queueing started OR if the server
    // rejected the queue join (e.g. no pending mystery submission), send
    // them back to the previous screen.
    useEffect(() => {
        if (phase === 'idle' && queueStatus === null && matchFound === null) {
            // Initial mount — do nothing, the queue is starting.
            return;
        }
        if (phase === 'idle') router.back();
    }, [phase, queueStatus, matchFound, router]);

    const waited = Math.floor((queueStatus?.waitedMs ?? 0) / 1000);
    const headline =
        queueStatus?.state === 'matching_with_bot'
            ? 'Matching with a bot opponent…'
            : queueStatus?.state === 'expanded_search'
            ? 'Looking further afield…'
            : mode === 'mystery'
            ? 'Searching for a mystery opponent…'
            : 'Searching for an opponent…';
    const sub =
        queueStatus?.state === 'matching_with_bot'
            ? "No human matched within 20 seconds. We'll mark them clearly."
            : mode === 'mystery'
            ? 'Finding someone with a same-length word.'
            : "We're finding someone close to your rank.";

    function onCancel() {
        leaveQueue();
        router.back();
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

const styles = StyleSheet.create({
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
});
