// App top bar: wordmark on the left, a coins pill, a streak pill, and a
// settings gear on the right. Reads live values from the auth store so any
// screen can drop it in. Pass `title` to replace the wordmark, and `onBack`
// to show a back chevron instead.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';
import { Wordmark } from './Wordmark';
import { CountUp } from './CountUp';
import { StatsSheet } from './StatsSheet';
import type { MeResponse } from '../../types/index';

interface Props {
    title?: string;
    onBack?: () => void;
    /** Hide the coins/streak pills (e.g. on the settings screen itself). */
    compact?: boolean;
}

export const TopBar: React.FC<Props> = ({ title, onBack, compact }) => {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const coins = user && 'coins' in user ? user.coins : 0;
    const streak =
        user && 'streak' in user ? user.streak.playStreak : 0;
    const shields = user && 'boosts' in user ? user.boosts.streakShields : 0;
    const [streakOpen, setStreakOpen] = useState(false);

    // Coins count up from the last value shown and the pill pops, so a reward
    // landing is visible wherever the player is.
    const [range, setRange] = useState({ from: coins, to: coins });
    if (range.to !== coins) setRange({ from: range.to, to: coins });
    const from = range.from;
    const pop = useSharedValue(1);
    useEffect(() => {
        if (range.to > range.from) pop.value = withSequence(withTiming(1.2, { duration: 160 }), withTiming(1, { duration: 260 }));
    }, [range, pop]);
    const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

    return (
        <View style={styles.bar}>
            <View style={styles.left}>
                {onBack ? (
                    <Pressable
                        onPress={onBack}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                        style={styles.backBtn}
                    >
                        <Ionicons name="chevron-back" size={22} color={colors.text} />
                    </Pressable>
                ) : null}
                {title ? (
                    <Text style={styles.title} allowFontScaling={false}>
                        {title}
                    </Text>
                ) : (
                    <Wordmark size={24} />
                )}
            </View>

            <View style={styles.right}>
                {!compact ? (
                    <>
                        <Animated.View style={[styles.pill, popStyle]}>
                            <Ionicons name="ellipse" size={12} color={colors.warning} />
                            <CountUp from={from} to={coins} durationMs={700} format={formatCoins} style={styles.pillText} />
                        </Animated.View>
                        {/* Daily play streak (days in a row): tap for what it is and what it pays. */}
                        <Pressable
                            style={styles.pill}
                            onPress={() => setStreakOpen(true)}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`Daily streak: ${streak} ${streak === 1 ? 'day' : 'days'}`}
                        >
                            <Ionicons name="flame" size={13} color={colors.warning} />
                            <Text style={styles.pillText} allowFontScaling={false}>
                                {streak}
                            </Text>
                            {shields > 0 ? (
                                <>
                                    <Ionicons name="shield-half" size={12} color={colors.textDim} />
                                    <Text style={styles.pillText} allowFontScaling={false}>
                                        {shields}
                                    </Text>
                                </>
                            ) : null}
                        </Pressable>
                    </>
                ) : null}
                <Pressable
                    onPress={() => router.push('/(app)/settings')}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Settings"
                    style={styles.gear}
                >
                    <Ionicons name="settings-outline" size={20} color={colors.textDim} />
                </Pressable>
            </View>
            {user && 'streak' in user ? (
                <StatsSheet visible={streakOpen} focus="streak" onClose={() => setStreakOpen(false)} me={user as MeResponse} />
            ) : null}
        </View>
    );
};

function formatCoins(n: number): string {
    return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        bar: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
        },
        left: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
        backBtn: { padding: 2 },
        title: {
            color: colors.text,
            fontFamily: typography.familyDisplay,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.bold,
        },
        right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        pill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.pill,
            paddingHorizontal: 10,
            paddingVertical: 5,
        },
        pillText: {
            color: colors.text,
            fontFamily: typography.familyMonoBold,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.bold,
        },
        gear: { padding: 4 },
    })
);
