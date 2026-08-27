// "Now equipped" reveal. When the player equips a cosmetic we briefly show the
// PREVIOUS look transitioning into the NEW one — before → after — so the change
// feels tangible. Auto-dismisses; tap anywhere to skip.

import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    withSpring,
    withRepeat,
    withDelay,
    Easing,
    cancelAnimation,
} from 'react-native-reanimated';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';
import { CosmeticPreview } from './CosmeticPreview';
import { impact, ImpactStyle } from '../../lib/haptics';
import type { CosmeticCategory } from '../../types/index';

export interface EquipTarget {
    id: string | null;
    name?: string;
    renderData?: Record<string, unknown> | null;
}

interface Props {
    visible: boolean;
    category: CosmeticCategory | null;
    from: EquipTarget | null;
    to: EquipTarget | null;
    onDone: () => void;
}

const HOLD_MS = 1900;

export const EquipTransition: React.FC<Props> = ({ visible, category, from, to, onDone }) => {
    const appear = useSharedValue(0);
    const pop = useSharedValue(0);
    const glow = useSharedValue(0);

    useEffect(() => {
        if (visible && category && to) {
            appear.value = 0;
            pop.value = 0;
            appear.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.ease) });
            // New preview pops in a touch after the card appears.
            pop.value = withDelay(220, withSpring(1, { damping: 9, stiffness: 140 }));
            glow.value = withDelay(
                220,
                withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true)
            );
            impact(ImpactStyle.Medium);
            const t = setTimeout(onDone, HOLD_MS);
            return () => {
                clearTimeout(t);
                cancelAnimation(appear);
                cancelAnimation(pop);
                cancelAnimation(glow);
            };
        }
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, category, to?.id]);

    const backdropStyle = useAnimatedStyle(() => ({ opacity: appear.value }));
    const cardStyle = useAnimatedStyle(() => ({
        opacity: appear.value,
        transform: [{ translateY: (1 - appear.value) * 24 }, { scale: 0.94 + appear.value * 0.06 }],
    }));
    const oldStyle = useAnimatedStyle(() => ({
        opacity: 0.45 + (1 - pop.value) * 0.2,
    }));
    const newStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 0.6 + pop.value * 0.4 }],
        opacity: pop.value,
    }));
    const glowStyle = useAnimatedStyle(() => ({
        opacity: 0.25 + glow.value * 0.55,
        transform: [{ scale: 0.9 + glow.value * 0.25 }],
    }));

    if (!category || !to) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onDone}>
            <Animated.View style={[styles.backdrop, backdropStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onDone} />
                <Animated.View style={[styles.card, cardStyle]} pointerEvents="none">
                    <Text style={styles.kicker} allowFontScaling={false}>
                        NOW EQUIPPED
                    </Text>

                    <View style={styles.stage}>
                        {/* BEFORE */}
                        <View style={styles.slot}>
                            {from && from.id !== to.id ? (
                                <>
                                    <Animated.View style={oldStyle}>
                                        <CosmeticPreview
                                            category={category}
                                            id={from.id}
                                            renderData={from.renderData}
                                            size={72}
                                        />
                                    </Animated.View>
                                    <Text style={styles.slotLabel} allowFontScaling={false}>
                                        BEFORE
                                    </Text>
                                </>
                            ) : (
                                <View style={{ width: 72, height: 72 }} />
                            )}
                        </View>

                        <Ionicons name="arrow-forward" size={26} color={colors.textDim} />

                        {/* AFTER */}
                        <View style={styles.slot}>
                            <View style={styles.newWrap}>
                                <Animated.View
                                    style={[
                                        styles.halo,
                                        { backgroundColor: colors.primary },
                                        glowStyle,
                                    ]}
                                    pointerEvents="none"
                                />
                                <Animated.View style={newStyle}>
                                    <CosmeticPreview
                                        category={category}
                                        id={to.id}
                                        renderData={to.renderData}
                                        size={80}
                                    />
                                </Animated.View>
                            </View>
                            <Text style={[styles.slotLabel, { color: colors.primary }]} allowFontScaling={false}>
                                AFTER
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.name} allowFontScaling={false} numberOfLines={1}>
                        {to.name ?? 'Equipped'}
                    </Text>
                    <View style={styles.check}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                        <Text style={styles.checkText} allowFontScaling={false}>
                            Equipped
                        </Text>
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.82)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.xl,
        },
        card: {
            width: '100%',
            maxWidth: 360,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: spacing.xl,
            paddingHorizontal: spacing.lg,
            alignItems: 'center',
            gap: spacing.md,
        },
        kicker: {
            color: colors.textDim,
            fontFamily: typography.familyMono,
            fontSize: 12,
            letterSpacing: 3,
        },
        stage: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.lg,
            marginVertical: spacing.sm,
        },
        slot: { alignItems: 'center', gap: spacing.sm, minWidth: 90 },
        slotLabel: {
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 10,
            letterSpacing: 1.5,
        },
        newWrap: { alignItems: 'center', justifyContent: 'center' },
        halo: {
            position: 'absolute',
            width: 96,
            height: 96,
            borderRadius: 48,
        },
        name: {
            color: colors.text,
            fontFamily: typography.familyDisplay,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.black,
            textAlign: 'center',
        },
        check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        checkText: {
            color: colors.primary,
            fontFamily: typography.familyMono,
            fontSize: typography.sizes.xs,
            letterSpacing: 1,
            textTransform: 'uppercase',
        },
    })
);
