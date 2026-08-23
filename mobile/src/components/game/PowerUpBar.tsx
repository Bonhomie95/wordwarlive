// In-match power-up bar. Surfaces the three EARNED power-ups (reveal /
// scramble / lock) with their remaining counts and fires them at the server.
//
// The server is authoritative — it decrements inventory on use and rejects
// when empty or while the player is locked. This UI mirrors that state:
// buttons disable at 0 charges, while the player is locked, or between the
// tap and the ack (to prevent double-spend).

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';
import { impact, ImpactStyle } from '../../lib/haptics';

export type PowerUpKind = 'reveal' | 'scramble' | 'lock';

interface Props {
    counts: { reveal: number; scramble: number; lock: number };
    /** True while the player is locked by the opponent — disables all. */
    locked: boolean;
    onUse: (kind: PowerUpKind) => Promise<{ ok: boolean; error?: string }>;
}

const META: Record<
    PowerUpKind,
    { icon: keyof typeof Ionicons.glyphMap; label: string; a11y: string }
> = {
    reveal: { icon: 'eye-outline', label: 'Reveal', a11y: 'Use reveal power-up' },
    scramble: { icon: 'shuffle-outline', label: 'Scramble', a11y: 'Use scramble power-up' },
    lock: { icon: 'lock-closed-outline', label: 'Lock', a11y: 'Use lock power-up' },
};

export const PowerUpBar: React.FC<Props> = ({ counts, locked, onUse }) => {
    const [busy, setBusy] = useState<PowerUpKind | null>(null);

    const kinds: PowerUpKind[] = ['reveal', 'scramble', 'lock'];
    // Hide entirely if the player owns nothing — keeps the match screen clean
    // for players who haven't earned any yet.
    const total = counts.reveal + counts.scramble + counts.lock;
    if (total === 0) return null;

    async function handle(kind: PowerUpKind) {
        if (busy) return;
        setBusy(kind);
        impact(ImpactStyle.Medium);
        try {
            await onUse(kind);
        } finally {
            setBusy(null);
        }
    }

    return (
        <View style={styles.bar}>
            {kinds.map((kind) => {
                const count = counts[kind];
                const disabled = locked || count <= 0 || busy !== null;
                return (
                    <Pressable
                        key={kind}
                        onPress={() => handle(kind)}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityLabel={`${META[kind].a11y}, ${count} left`}
                        accessibilityState={{ disabled }}
                        style={({ pressed }) => [
                            styles.btn,
                            disabled ? styles.btnDisabled : null,
                            pressed && !disabled ? { transform: [{ scale: 0.95 }] } : null,
                        ]}
                    >
                        <Ionicons
                            name={META[kind].icon}
                            size={18}
                            color={disabled ? colors.textMuted : colors.primary}
                        />
                        <Text
                            style={[styles.label, disabled ? styles.labelDisabled : null]}
                            allowFontScaling={false}
                        >
                            {META[kind].label}
                        </Text>
                        <View style={styles.countPill}>
                            <Text style={styles.countText} allowFontScaling={false}>
                                {count}
                            </Text>
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        bar: {
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            marginBottom: spacing.xs,
        },
        btn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.pill,
            paddingVertical: 6,
            paddingHorizontal: 10,
        },
        btnDisabled: {
            opacity: 0.45,
        },
        label: {
            color: colors.text,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
        },
        labelDisabled: {
            color: colors.textMuted,
        },
        countPill: {
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.primaryDim,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
        },
        countText: {
            color: colors.bg,
            fontSize: 11,
            fontWeight: typography.weights.black,
        },
    })
);
