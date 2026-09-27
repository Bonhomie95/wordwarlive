import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors } from '../../theme/colors';

export function ProgressBar({ progress, label }: { progress: number; label: string }) {
    const target = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const value = useSharedValue(target);
    const reduced = useReducedMotion();
    useEffect(() => {
        value.value = reduced ? target : withTiming(target, { duration: 420, easing: Easing.out(Easing.cubic) });
    }, [target, reduced, value]);
    const fill = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));
    return <View accessible accessibilityRole="progressbar" accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
        style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.border }}>
        <Animated.View style={[{ height: '100%', borderRadius: 3, backgroundColor: colors.primary }, fill]} />
    </View>;
}
