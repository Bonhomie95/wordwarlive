// App top bar: wordmark on the left, a coins pill, a streak pill, and a
// settings gear on the right. Reads live values from the auth store so any
// screen can drop it in. Pass `title` to replace the wordmark, and `onBack`
// to show a back chevron instead.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';
import { Wordmark } from './Wordmark';

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
                        <View style={styles.pill}>
                            <Ionicons name="ellipse" size={12} color={colors.warning} />
                            <Text style={styles.pillText} allowFontScaling={false}>
                                {formatCoins(coins)}
                            </Text>
                        </View>
                        <View style={styles.pill}>
                            <Ionicons name="flash" size={13} color={colors.primary} />
                            <Text style={styles.pillText} allowFontScaling={false}>
                                {streak}
                            </Text>
                        </View>
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
