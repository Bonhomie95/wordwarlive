import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';
import { useGameStore } from '../../store/gameStore';

interface Props {
    /** Optional override — if omitted, reads from the gameStore directly so
     *  the per-second tick stays scoped to this component instead of
     *  triggering a re-render of every match-screen consumer. */
    msRemaining?: number;
}

const TimerRaw: React.FC<Props> = ({ msRemaining: msProp }) => {
    // Subscribing here means only Timer rerenders each tick. Match.tsx
    // doesn't read msRemaining at all in the optimized path.
    const msFromStore = useGameStore((s) => s.msRemaining);
    const msRemaining = msProp ?? msFromStore;

    const pulse = useSharedValue(0);
    const danger = msRemaining < 10_000;
    const critical = msRemaining < 5_000;

    useEffect(() => {
        if (critical) {
            pulse.value = withRepeat(withTiming(1, { duration: 500 }), -1, true);
        } else {
            cancelAnimation(pulse);
            pulse.value = 0;
        }
        // Stop the loop if we unmount mid-critical (e.g. match ends while the
        // pulse is running) so no animation lingers on a torn-down view.
        return () => cancelAnimation(pulse);
    }, [critical, pulse]);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + pulse.value * 0.06 }],
    }));

    const seconds = Math.max(0, Math.ceil(msRemaining / 1000));
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');

    const fg = critical ? colors.danger : danger ? colors.warning : colors.text;

    return (
        <Animated.View style={[styles.wrap, style]}>
            <Text
                style={[
                    styles.label,
                    { color: fg },
                    critical
                        ? { textShadowColor: colors.danger, textShadowRadius: 14 }
                        : null,
                ]}
                allowFontScaling={false}
            >
                {mm}:{ss}
            </Text>
        </Animated.View>
    );
};

export const Timer = memo(TimerRaw);

const styles = makeThemedStyles(() => StyleSheet.create({
    wrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontFamily: typography.familyMonoBold,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.black,
        letterSpacing: 2,
        textShadowOffset: { width: 0, height: 0 },
    },
}));
