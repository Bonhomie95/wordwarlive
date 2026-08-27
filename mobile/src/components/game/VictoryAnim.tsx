// Victory animation overlay, driven by the equipped victory_anim cosmetic:
//   pulse     → expanding radial rings
//   confetti  → falling colored particles
//   lightning → flashes striking from the corners
// Rendered over the post-game screen on a win. Purely decorative; pointer
// events pass through.

import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    withDelay,
    withSequence,
    Easing,
    interpolate,
    cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';
import type { VictoryKind } from '../../lib/cosmetics';

interface Props {
    kind: VictoryKind;
}

export const VictoryAnim: React.FC<Props> = ({ kind }) => {
    if (kind === 'pulse') return <Pulse />;
    if (kind === 'confetti') return <Confetti />;
    return <Lightning />;
};

// ─── Pulse: expanding rings ──────────────────────────────────────────────
function Pulse() {
    return (
        <View style={styles.fill} pointerEvents="none">
            <Ring delay={0} />
            <Ring delay={500} />
            <Ring delay={1000} />
        </View>
    );
}
function Ring({ delay }: { delay: number }) {
    const p = useSharedValue(0);
    useEffect(() => {
        p.value = withDelay(
            delay,
            withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }), -1, false)
        );
        return () => cancelAnimation(p);
    }, [p, delay]);
    const style = useAnimatedStyle(() => ({
        transform: [{ scale: 0.2 + p.value * 2.2 }],
        opacity: 0.6 * (1 - p.value),
    }));
    return (
        <Animated.View style={[styles.centered]} pointerEvents="none">
            {/* borderColor applied at render time so it tracks the theme. */}
            <Animated.View style={[styles.ring, { borderColor: colors.primary }, style]} />
        </Animated.View>
    );
}

// ─── Confetti: falling particles ─────────────────────────────────────────
const CONFETTI_COLORS = ['#3DDC97', '#F4B940', '#FF4FCB', '#7CC8FF', '#C490FF'];
function Confetti() {
    const { width } = useWindowDimensions();
    // Deterministic-ish spread across the width.
    const pieces = Array.from({ length: 26 }, (_, i) => i);
    return (
        <View style={styles.fill} pointerEvents="none">
            {pieces.map((i) => (
                <ConfettiPiece
                    key={i}
                    x={((i * 53) % 100) / 100 * width}
                    delay={(i % 8) * 180}
                    color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]!}
                    drift={((i % 5) - 2) * 24}
                />
            ))}
        </View>
    );
}
function ConfettiPiece({ x, delay, color, drift }: { x: number; delay: number; color: string; drift: number }) {
    const { height } = useWindowDimensions();
    const p = useSharedValue(0);
    useEffect(() => {
        p.value = withDelay(
            delay,
            withRepeat(withTiming(1, { duration: 2600, easing: Easing.in(Easing.quad) }), -1, false)
        );
        return () => cancelAnimation(p);
    }, [p, delay]);
    const style = useAnimatedStyle(() => ({
        transform: [
            { translateX: x + drift * p.value },
            { translateY: interpolate(p.value, [0, 1], [-40, height + 40]) },
            { rotate: `${p.value * 720}deg` },
        ],
        opacity: p.value < 0.9 ? 1 : (1 - p.value) * 10,
    }));
    return <Animated.View style={[styles.confetti, { backgroundColor: color }, style]} pointerEvents="none" />;
}

// ─── Lightning: corner flashes ───────────────────────────────────────────
function Lightning() {
    const flash = useSharedValue(0);
    useEffect(() => {
        flash.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 90 }),
                withTiming(0, { duration: 160 }),
                withDelay(700, withTiming(0, { duration: 1 }))
            ),
            -1,
            false
        );
        return () => cancelAnimation(flash);
    }, [flash]);
    const style = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));
    return (
        <View style={styles.fill} pointerEvents="none">
            <Animated.View style={[styles.bolt, { top: -60, left: -60 }, style]} />
            <Animated.View style={[styles.bolt, { top: -60, right: -60 }, style]} />
            <Animated.View style={[styles.bolt, { bottom: -60, left: -60 }, style]} />
            <Animated.View style={[styles.bolt, { bottom: -60, right: -60 }, style]} />
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
    centered: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    ring: {
        width: 240,
        height: 240,
        borderRadius: 120,
        borderWidth: 4,
    },
    confetti: {
        position: 'absolute',
        width: 12,
        height: 16,
        borderRadius: 2,
    },
    bolt: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 140,
        backgroundColor: '#FFFFFF',
    },
});
