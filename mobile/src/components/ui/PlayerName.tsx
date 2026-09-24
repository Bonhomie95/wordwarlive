// Username text styled by the equipped nameplate cosmetic:
//   plain   → normal text color
//   solid   → a fixed color (e.g. gold)
//   shimmer → an animated color cycle (rainbow "Spectrum" nameplate)
// Works for any player via their equipped nameplate id.

import React, { useEffect } from 'react';
import { type StyleProp, type TextStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    interpolateColor,
    Easing,
    cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';
import { nameplateVisual, SHIMMER_COLORS } from '../../lib/cosmetics';

interface Props {
    username: string;
    nameplateId?: string | null;
    style?: StyleProp<TextStyle>;
    numberOfLines?: number;
}

export const PlayerName: React.FC<Props> = ({
    username,
    nameplateId,
    style,
    numberOfLines,
}) => {
    const np = nameplateVisual(nameplateId);
    const t = useSharedValue(0);

    useEffect(() => {
        if (np.effect === 'shimmer') {
            t.value = withRepeat(
                // Slow cycle: this runs continuously wherever the nameplate is
                // shown, so keep the per-frame work low.
                withTiming(1, { duration: 4500, easing: Easing.linear }),
                -1,
                false
            );
        } else {
            cancelAnimation(t);
            t.value = 0;
        }
        return () => cancelAnimation(t);
    }, [np.effect, t]);

    const animatedStyle = useAnimatedStyle(() => {
        if (np.effect !== 'shimmer') return {};
        const inputs = SHIMMER_COLORS.map((_, i) => i / (SHIMMER_COLORS.length - 1));
        return { color: interpolateColor(t.value, inputs, SHIMMER_COLORS) };
    });

    const baseColor =
        np.effect === 'solid' && np.color ? np.color : colors.text;

    return (
        <Animated.Text
            allowFontScaling={false}
            numberOfLines={numberOfLines}
            style={[style, { color: baseColor }, animatedStyle]}
        >
            {username}
        </Animated.Text>
    );
};
