// Full-screen moment for a rank tier change after a match: the old badge
// gives way to the new one, which pops in with rings in the new tier's
// colour. Tap anywhere (or wait) to continue. Static under reduced motion.

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { notify, NotificationType } from '../../lib/haptics';
import { makeThemedStyles, colors, rankColors, type RankTier } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';
import { glow } from '../../theme/effects';

interface Props {
    from: RankTier;
    to: RankTier;
    points: number;
    onDone: () => void;
}

const AUTO_DISMISS_MS = 4200;
/** When the new badge lands (after the old one has bowed out). */
const POP_AT_MS = 900;

export const RankReveal: React.FC<Props> = ({ from, to, points, onDone }) => {
    const reduced = useReducedMotion();
    const up = rankIndex(to) > rankIndex(from);
    const fromColor = rankColors[from];
    const toColor = rankColors[to];

    const backdrop = useSharedValue(0);
    const oldBadge = useSharedValue(0); // 0 hidden → 1 shown → 2 gone
    const newBadge = useSharedValue(0); // 0 hidden → 1 landed
    const title = useSharedValue(0);

    useEffect(() => {
        if (reduced) {
            backdrop.value = 1; oldBadge.value = 2; newBadge.value = 1; title.value = 1;
        } else {
            backdrop.value = withTiming(1, { duration: 250 });
            oldBadge.value = withSequence(
                withTiming(1, { duration: 280, easing: Easing.out(Easing.back(1.4)) }),
                withDelay(POP_AT_MS - 280 - 220, withTiming(2, { duration: 220, easing: Easing.in(Easing.quad) }))
            );
            newBadge.value = withDelay(POP_AT_MS, withSpring(1, { damping: 9, stiffness: 160, mass: 0.7 }));
            title.value = withDelay(POP_AT_MS + 120, withTiming(1, { duration: 300 }));
        }
        const haptic = setTimeout(
            () => notify(up ? NotificationType.Success : NotificationType.Warning),
            reduced ? 0 : POP_AT_MS
        );
        const auto = setTimeout(onDone, AUTO_DISMISS_MS);
        return () => {
            clearTimeout(haptic);
            clearTimeout(auto);
            cancelAnimation(backdrop); cancelAnimation(oldBadge);
            cancelAnimation(newBadge); cancelAnimation(title);
        };
    }, [reduced, up, onDone, backdrop, oldBadge, newBadge, title]);

    const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
    const oldStyle = useAnimatedStyle(() => {
        const v = oldBadge.value;
        const scale = v <= 1 ? 0.6 + 0.4 * v : 1 - 0.5 * (v - 1);
        const opacity = v <= 1 ? v : 1 - (v - 1);
        return { opacity, transform: [{ scale }, { translateY: v > 1 ? 24 * (v - 1) : 0 }] };
    });
    const newStyle = useAnimatedStyle(() => ({
        opacity: Math.min(1, newBadge.value * 2),
        transform: [{ scale: 0.3 + 0.7 * newBadge.value }],
    }));
    const titleStyle = useAnimatedStyle(() => ({
        opacity: title.value,
        transform: [{ translateY: (1 - title.value) * 10 }],
    }));

    return (
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
            <Pressable style={styles.fill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Continue">
                <View style={styles.center}>
                    {!reduced ? (
                        <>
                            <Ring color={toColor} delay={POP_AT_MS} />
                            <Ring color={toColor} delay={POP_AT_MS + 350} />
                            <Ring color={toColor} delay={POP_AT_MS + 700} />
                        </>
                    ) : null}

                    <View style={styles.badgeStage}>
                        <Animated.View style={[styles.badgeWrap, oldStyle]}>
                            <View style={[styles.badge, { backgroundColor: fromColor, borderColor: colors.border }]} />
                            <Text style={[styles.badgeLabel, { color: fromColor }]} allowFontScaling={false}>
                                {from.toUpperCase()}
                            </Text>
                        </Animated.View>
                        <Animated.View style={[styles.badgeWrap, styles.overlayBadge, newStyle]}>
                            <View style={[styles.badge, styles.badgeBig, { backgroundColor: toColor, borderColor: toColor }, glow(toColor, 28, 0.9)]}>
                                <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={34} color="#0F1115" />
                            </View>
                            <Text style={[styles.badgeLabel, styles.badgeLabelBig, { color: toColor }]} allowFontScaling={false}>
                                {to.toUpperCase()}
                            </Text>
                        </Animated.View>
                    </View>

                    <Animated.View style={[styles.titleWrap, titleStyle]}>
                        <Text style={[styles.title, { color: toColor }]} allowFontScaling={false}>
                            {up ? 'RANK UP!' : 'RANK DOWN'}
                        </Text>
                        <Text style={styles.subtitle} allowFontScaling={false}>
                            {from.toUpperCase()}  →  {to.toUpperCase()}  ·  {points} RP
                        </Text>
                        <Text style={styles.hint} allowFontScaling={false}>
                            Tap to continue
                        </Text>
                    </Animated.View>
                </View>
            </Pressable>
        </Animated.View>
    );
};

function Ring({ color, delay }: { color: string; delay: number }) {
    const p = useSharedValue(0);
    useEffect(() => {
        p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), 2, false));
        return () => cancelAnimation(p);
    }, [p, delay]);
    const style = useAnimatedStyle(() => ({
        transform: [{ scale: 0.4 + p.value * 2.6 }],
        opacity: 0.55 * (1 - p.value),
    }));
    return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color }, style]} />;
}

function rankIndex(tier: RankTier): number {
    return ['stone', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'legend'].indexOf(tier);
}

const styles = makeThemedStyles(() => StyleSheet.create({
    backdrop: { backgroundColor: 'rgba(8,9,12,0.92)', zIndex: 50 },
    fill: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
    ring: {
        position: 'absolute',
        // Centred on the badge circle (the stage also holds the label below).
        marginTop: -34,
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 3,
    },
    badgeStage: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
    badgeWrap: { alignItems: 'center', gap: spacing.sm },
    overlayBadge: { position: 'absolute' },
    badge: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
    badgeBig: { width: 108, height: 108, borderRadius: 54 },
    badgeLabel: { fontFamily: typography.familyMonoBold, fontSize: typography.sizes.sm, letterSpacing: 2 },
    badgeLabelBig: { fontSize: typography.sizes.lg },
    titleWrap: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xl },
    title: { fontFamily: typography.familyMonoBold, fontSize: typography.sizes.xxl, letterSpacing: 3 },
    subtitle: { color: colors.text, fontFamily: typography.familyMono, fontSize: typography.sizes.sm },
    hint: {
        marginTop: spacing.md,
        color: colors.textMuted,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
}));
