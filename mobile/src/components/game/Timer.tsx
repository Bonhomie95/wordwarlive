import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';

interface Props {
    msRemaining: number;
}

const TimerRaw: React.FC<Props> = ({ msRemaining }) => {
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
    }, [critical, pulse]);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + pulse.value * 0.06 }],
    }));

    const seconds = Math.max(0, Math.ceil(msRemaining / 1000));
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');

    const bg = critical ? colors.danger : danger ? colors.warning : colors.surfaceElevated;
    const fg = critical || danger ? '#0F1115' : colors.text;

    return (
        <Animated.View style={[styles.pill, { backgroundColor: bg }, style]}>
            <Text style={[styles.label, { color: fg }]} allowFontScaling={false}>
                {mm}:{ss}
            </Text>
        </Animated.View>
    );
};

export const Timer = memo(TimerRaw);

const styles = StyleSheet.create({
    pill: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
    },
});
