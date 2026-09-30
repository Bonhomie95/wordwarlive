// Springs its children in (scale + fade) once on mount. Static under
// reduced motion.
import React, { useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface Props {
    delayMs?: number;
    style?: ViewStyle | ViewStyle[];
    children: React.ReactNode;
}

export const PopIn: React.FC<Props> = ({ delayMs = 0, style, children }) => {
    const reduced = useReducedMotion();
    const p = useSharedValue(reduced ? 1 : 0);
    useEffect(() => {
        if (reduced) { p.value = 1; return; }
        p.value = withDelay(delayMs, withSpring(1, { damping: 11, stiffness: 170, mass: 0.8 }));
    }, [reduced, delayMs, p]);
    const anim = useAnimatedStyle(() => ({
        opacity: Math.min(1, p.value * 1.5),
        transform: [{ scale: 0.7 + 0.3 * p.value }],
    }));
    return <Animated.View style={[style, anim]}>{children}</Animated.View>;
};
