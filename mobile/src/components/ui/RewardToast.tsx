// "+50 XP" / "+30 coins" toast that drops in from the top when a reward has
// actually landed, with the numbers counting up. <RewardToastHost/> is
// mounted once in the root layout; call rewardToast() from anywhere.

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { create } from 'zustand';
import { CountUp } from './CountUp';
import { notify, NotificationType } from '../../lib/haptics';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';
import { glow } from '../../theme/effects';

export interface RewardToastItem {
    id: number;
    title: string;
    coins?: number;
    xp?: number;
    note?: string;
}

const useToasts = create<{ queue: RewardToastItem[] }>(() => ({ queue: [] }));
let nextId = 1;

export function rewardToast(t: Omit<RewardToastItem, 'id'>): void {
    useToasts.setState((s) => ({ queue: [...s.queue, { ...t, id: nextId++ }] }));
}

const SHOW_MS = 2600;

export const RewardToastHost: React.FC = () => {
    const current = useToasts((s) => s.queue[0]);
    const insets = useSafeAreaInsets();
    const y = useSharedValue(-160);
    useEffect(() => {
        if (!current) return;
        notify(NotificationType.Success);
        const dismiss = () => useToasts.setState((s) => ({ queue: s.queue.slice(1) }));
        y.value = -160;
        y.value = withSequence(
            withTiming(0, { duration: 320 }),
            withDelay(SHOW_MS, withTiming(-160, { duration: 260 }, (done) => {
                if (done) runOnJS(dismiss)();
            }))
        );
    }, [current, y]);
    const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
    if (!current) return null;
    return (
        <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.sm }, style]}>
            <View style={[styles.card, glow(colors.primary, 16, 0.5)]}>
                <Text style={styles.title} allowFontScaling={false}>
                    {current.title}
                </Text>
                <View style={styles.row}>
                    {current.coins ? (
                        <View style={styles.amount}>
                            <Ionicons name="ellipse" size={16} color={colors.warning} />
                            <CountUp to={current.coins} signed delayMs={250} durationMs={800} suffix=" coins" style={[styles.num, { color: colors.warning }]} />
                        </View>
                    ) : null}
                    {current.xp ? (
                        <View style={styles.amount}>
                            <Ionicons name="flash" size={16} color={colors.primary} />
                            <CountUp to={current.xp} signed delayMs={250} durationMs={800} suffix=" Pass XP" style={[styles.num, { color: colors.primary }]} />
                        </View>
                    ) : null}
                </View>
                {current.note ? (
                    <Text style={styles.note} allowFontScaling={false}>
                        {current.note}
                    </Text>
                ) : null}
            </View>
        </Animated.View>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 1000, alignItems: 'center' },
        card: {
            minWidth: 220,
            maxWidth: 380,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.primary,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            alignItems: 'center',
            gap: 6,
        },
        title: { color: colors.text, fontFamily: typography.familyDisplay, fontWeight: typography.weights.black, fontSize: typography.sizes.md },
        row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
        amount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        num: { fontFamily: typography.familyDisplay, fontWeight: typography.weights.black, fontSize: typography.sizes.lg },
        note: { color: colors.textMuted, fontFamily: typography.familyMono, fontSize: typography.sizes.xs, textAlign: 'center' },
    })
);
