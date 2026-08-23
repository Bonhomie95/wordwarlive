// Shared visual primitives for the revamped UI. Keeping them together keeps
// the design language consistent across screens.

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle, type TextStyle } from 'react-native';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';
import { glow } from '../../theme/effects';

/** Surface card with a subtle border; `glowing` adds a neon primary aura. */
export const Card: React.FC<{
    children: React.ReactNode;
    style?: ViewStyle;
    glowing?: boolean;
    accent?: string;
}> = ({ children, style, glowing, accent }) => (
    <View
        style={[
            styles.card,
            accent ? { borderColor: accent } : null,
            glowing ? glow(accent ?? colors.primary, 18, 0.25) : null,
            style,
        ]}
    >
        {children}
    </View>
);

/** Uppercase monospace micro-label ("CURRENT RANK", "W/L RATIO"). */
export const MonoLabel: React.FC<{
    children: React.ReactNode;
    color?: string;
    size?: number;
    style?: TextStyle;
}> = ({ children, color, size, style }) => (
    <Text
        allowFontScaling={false}
        style={[styles.monoLabel, color ? { color } : null, size ? { fontSize: size } : null, style]}
    >
        {children}
    </Text>
);

/** Big glowing display heading ("SOLVED!", "SEARCHING FOR OPPONENT…"). */
export const HeroTitle: React.FC<{
    children: React.ReactNode;
    color?: string;
    size?: number;
    style?: TextStyle;
}> = ({ children, color = colors.primary, size = typography.sizes.xxl, style }) => (
    <Text
        allowFontScaling={false}
        style={[
            styles.hero,
            {
                color,
                fontSize: size,
                textShadowColor: color,
            },
            style,
        ]}
    >
        {children}
    </Text>
);

/** A stat tile — big mono value with a small caption underneath. */
export const StatTile: React.FC<{
    value: string;
    label: string;
    icon?: React.ReactNode;
    style?: ViewStyle;
}> = ({ value, label, icon, style }) => (
    <View style={[styles.statTile, style]}>
        {icon ? <View style={styles.statIcon}>{icon}</View> : null}
        <Text style={styles.statValue} allowFontScaling={false}>
            {value}
        </Text>
        <Text style={styles.statLabel} allowFontScaling={false}>
            {label}
        </Text>
    </View>
);

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        card: {
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.lg,
        },
        monoLabel: {
            color: colors.textDim,
            fontFamily: typography.familyMono,
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
        },
        hero: {
            fontFamily: typography.familyDisplay,
            fontWeight: typography.weights.black,
            letterSpacing: 1,
            textAlign: 'center',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 18,
        },
        statTile: {
            flex: 1,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.md,
            alignItems: 'center',
            gap: 2,
        },
        statIcon: { marginBottom: 2 },
        statValue: {
            color: colors.text,
            fontFamily: typography.familyMonoBold,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.black,
        },
        statLabel: {
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
        },
    })
);
