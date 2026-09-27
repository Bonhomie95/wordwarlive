import { useEffect } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { selection } from '../../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** One tactile interaction language for actions and mode cards. */
export function MotionPressable({ style, onPressIn, onPressOut, disabled, ...props }: PressableProps) {
    const reduced = useReducedMotion();
    const scale = useSharedValue(1);
    useEffect(() => { if (disabled || reduced) scale.value = 1; }, [disabled, reduced, scale]);
    const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return <AnimatedPressable {...props} disabled={disabled}
        style={(state) => [typeof style === 'function' ? style(state) : style, motion]}
        onPressIn={(event) => {
            if (!disabled) {
                if (!reduced) scale.value = withSpring(0.975, { damping: 24, stiffness: 420 });
                selection();
            }
            onPressIn?.(event);
        }}
        onPressOut={(event) => {
            scale.value = reduced ? 1 : withSpring(1, { damping: 18, stiffness: 320 });
            onPressOut?.(event);
        }}
    />;
}
