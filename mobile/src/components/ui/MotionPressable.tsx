import { useEffect, useState } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { selection } from '../../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** One tactile interaction language for actions and mode cards. */
export function MotionPressable({ style, onPressIn, onPressOut, onHoverIn, onHoverOut, disabled, ...props }: PressableProps) {
    const reduced = useReducedMotion();
    const [pressed, setPressed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const scale = useSharedValue(1);
    useEffect(() => { if (disabled || reduced) scale.set(1); }, [disabled, reduced, scale]);
    const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    // Generated RN types include hovered; legacy declarations only include pressed.
    // A named state object supports both declarations without a cast.
    const pressState = { pressed: pressed && !disabled, hovered };
    return <AnimatedPressable {...props} disabled={disabled}
        style={[typeof style === 'function' ? style(pressState) : style, motion]}
        onHoverIn={(event) => { setHovered(true); onHoverIn?.(event); }}
        onHoverOut={(event) => { setHovered(false); onHoverOut?.(event); }}
        onPressIn={(event) => {
            setPressed(true);
            if (!disabled) {
                if (!reduced) scale.set(withSpring(0.975, { damping: 24, stiffness: 420 }));
                selection();
            }
            onPressIn?.(event);
        }}
        onPressOut={(event) => {
            setPressed(false);
            scale.set(reduced ? 1 : withSpring(1, { damping: 18, stiffness: 320 }));
            onPressOut?.(event);
        }}
    />;
}
