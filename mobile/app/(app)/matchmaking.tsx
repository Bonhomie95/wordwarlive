// Matchmaking screen. Shown after the user taps Play. The game store
// drives state changes — `match_found` flips us to the live match screen.

import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui/Button';
import { useGameStore } from '../../src/store/gameStore';
import { colors } from '../../src/theme/colors';
import { typography, spacing } from '../../src/theme/typography';

export default function Matchmaking() {
    const router = useRouter();
    const phase = useGameStore((s) => s.phase);
    const queueStatus = useGameStore((s) => s.queueStatus);
    const matchFound = useGameStore((s) => s.matchFound);
    const leaveQueue = useGameStore((s) => s.leaveQueue);

    // When we get matched, jump to the match screen.
    useEffect(() => {
        if ((phase === 'matched' || phase === 'playing') && matchFound) {
            router.replace('/(app)/match');
        }
    }, [phase, matchFound, router]);

    // If the user backs out before queueing started, send them home.
    useEffect(() => {
        if (phase === 'idle') router.replace('/(app)');
    }, [phase, router]);

    const waited = Math.floor((queueStatus?.waitedMs ?? 0) / 1000);
    const headline =
        queueStatus?.state === 'matching_with_bot'
            ? 'Matching with a bot opponent…'
            : queueStatus?.state === 'expanded_search'
            ? 'Looking further afield…'
            : 'Searching for an opponent…';
    const sub =
        queueStatus?.state === 'matching_with_bot'
            ? 'No human matched within 20 seconds. We&apos;ll mark them clearly.'
            : 'We&apos;re finding someone close to your rank.';

    function onCancel() {
        leaveQueue();
        router.replace('/(app)');
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
