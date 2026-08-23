// Matchmaking screen (classic + mystery, via ?mode=). Visual revamp only —
// all the queue/focus/navigation logic is unchanged from before.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';
import { Screen } from '../../src/components/ui/Screen';
import { HeroTitle, MonoLabel, Card } from '../../src/components/ui/primitives';
import { useGameStore } from '../../src/store/gameStore';
import { useAuthStore } from '../../src/store/authStore';
import { colors, makeThemedStyles } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';
import { glow } from '../../src/theme/effects';

const PRO_TIPS = [
    'Save your Scramble power-up for the final 30 seconds when the board is nearly full.',
    'Your first guess should pack in common letters — think S, T, A, R, E.',
    'You can see your opponent’s tile colors, never their letters. Read their progress.',
    'Win streaks of 3, 5, 10… award a Reveal power-up. Power-ups are earned, never bought.',
    'A Lock power-up freezes your opponent’s power-ups for 8 seconds. Time it well.',
];

/** One expanding radar ring. */
function Ring({ delay }: { delay: number }) {
    const p = useSharedValue(0);
    useEffect(() => {
        p.value = withRepeat(
            withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
            -1,
            false
        );
        return () => cancelAnimation(p);
    }, [p]);
    const style = useAnimatedStyle(() => {
        // Stagger via a phase offset baked into the shared clock.
        const t = (p.value + delay) % 1;
        return {
            transform: [{ scale: 0.4 + t * 1.1 }],
            opacity: 0.5 * (1 - t),
        };
    });
    return <Animated.View style={[styles.ring, style]} pointerEvents="none" />;
}

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

    const focusedRef = useRef(false);
    const queueStartedRef = useRef(false);

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

    useEffect(() => {
        if (focusedRef.current && phase === 'idle' && queueStartedRef.current) {
            router.navigate('/(app)');
        }
    }, [phase, router]);

    const waited = Math.floor((queueStatus?.waitedMs ?? 0) / 1000);
    const finalizing = queueStatus?.state === 'finalizing';
    const headline = finalizing
        ? 'OPPONENT FOUND!'
        : mode === 'mystery'
        ? 'FINDING A DUELIST…'
        : 'SEARCHING FOR OPPONENT…';

    // Pick a stable tip per screen visit.
    const tip = useMemo(
        () => PRO_TIPS[Math.floor(Math.random() * PRO_TIPS.length)]!,
        []
    );

    function onCancel() {
        leaveQueue();
        router.navigate('/(app)');
    }

    return (
        <Screen>
            <View style={styles.body}>
                <View style={styles.radar}>
                    <Ring delay={0} />
                    <Ring delay={0.33} />
                    <Ring delay={0.66} />
                    <View style={[styles.core, glow(colors.primary, 22, 0.7)]}>
                        <Ionicons
                            name={finalizing ? 'flash' : 'person'}
                            size={30}
                            color={colors.primary}
                        />
                    </View>
                </View>

                <HeroTitle size={typography.sizes.xl} style={styles.headline}>
                    {headline}
                </HeroTitle>
                <MonoLabel size={12}>
                    {finalizing ? 'Get ready…' : `Estimated wait · ${formatWait(waited)}`}
                </MonoLabel>
            </View>

            <View style={styles.footer}>
                <Card style={styles.tipCard}>
                    <View style={styles.tipHead}>
                        <Ionicons name="bulb" size={15} color={colors.primary} />
                        <MonoLabel color={colors.primary}>Pro Tip</MonoLabel>
                    </View>
                    <Text style={styles.tipText} allowFontScaling={false}>
                        {tip}
                    </Text>
                </Card>
                <Pressable
                    onPress={onCancel}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel search"
                    style={({ pressed }) => [
                        styles.cancel,
                        pressed ? { opacity: 0.7 } : null,
                    ]}
                >
                    <Text style={styles.cancelText} allowFontScaling={false}>
                        CANCEL SEARCH
                    </Text>
                </Pressable>
            </View>
        </Screen>
    );
}

function formatWait(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

const RADAR = 170;
const styles = makeThemedStyles(() =>
    StyleSheet.create({
        body: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
        },
        radar: {
            width: RADAR,
            height: RADAR,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.lg,
        },
        ring: {
            position: 'absolute',
            width: RADAR,
            height: RADAR,
            borderRadius: RADAR / 2,
            borderWidth: 2,
            borderColor: colors.primary,
        },
        core: {
            width: 66,
            height: 66,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        headline: { marginTop: spacing.sm },
        footer: {
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
            gap: spacing.md,
        },
        tipCard: { gap: spacing.xs },
        tipHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        tipText: { color: colors.textDim, fontSize: typography.sizes.sm, lineHeight: 20 },
        cancel: {
            height: 52,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cancelText: {
            color: colors.danger,
            fontFamily: typography.familyDisplay,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.bold,
            letterSpacing: 1,
        },
    })
);
