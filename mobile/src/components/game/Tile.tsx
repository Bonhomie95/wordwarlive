import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';
import { typography, radius } from '../../theme/typography';
import type { Tile as TileColor } from '../../types/index';

interface Props {
    letter: string | null;
    state: TileColor | null;
    hideLetter?: boolean;
    /** Tile size. Numeric pixel value, or 'sm' (opponent mini-grid) / 'lg'
     *  (default 56). */
    size?: 'lg' | 'sm' | number;
    revealDelayMs?: number;
    hintLetter?: string | null;
    /** When true, this tile is the active cursor position. */
    cursor?: boolean;
}

const COLOR_FOR_STATE: Record<TileColor, string> = {
    correct: colors.tileCorrect,
    misplaced: colors.tileMisplaced,
    wrong: colors.tileWrong,
};

const TileRaw: React.FC<Props> = ({
    letter,
    state,
    hideLetter,
    size = 'lg',
    revealDelayMs = 0,
    hintLetter,
    cursor,
}) => {
    const flip = useSharedValue(0);
    useEffect(() => {
        if (state) {
            flip.value = withTiming(1, {
                duration: 350,
                easing: Easing.out(Easing.ease),
            });
        } else {
            flip.value = 0;
        }
    }, [state, flip]);

    const animatedStyle = useAnimatedStyle(() => {
        const scaleY = interpolate(flip.value, [0, 0.5, 1], [1, 0.6, 1]);
        const bgColor = state
            ? COLOR_FOR_STATE[state]
            : letter
            ? colors.surfaceElevated
            : colors.tileEmpty;
        return {
            backgroundColor: bgColor,
            transform: [{ scaleY }],
        };
    });

    // Resolve size: numeric → pixel value; 'sm' → 22; 'lg' → 56.
    const dim = typeof size === 'number' ? size : size === 'sm' ? 22 : 56;
    const isSmall = dim < 28;
    // Font scales with tile size — ~0.4× — so 4-letter tiles aren't huge and
    // 10-letter tiles still look proportionate.
    const fontSize = isSmall ? 0 : Math.round(dim * 0.4);
    const showLetter = !hideLetter && !!letter && !isSmall;
    const showHint = !hideLetter && !letter && !!hintLetter && !isSmall;
    const borderRadius = isSmall ? 3 : Math.min(radius.md, dim / 6);

    return (
        <Animated.View
            style={[
                styles.tile,
                { width: dim, height: dim, borderRadius },
                state
                    ? null
                    : cursor
                    ? styles.borderCursor
                    : letter
                    ? styles.borderActive
                    : showHint
                    ? styles.borderHint
                    : styles.borderEmpty,
                animatedStyle,
            ]}
        >
            {showLetter ? (
                <Text style={[styles.letter, { fontSize }]} allowFontScaling={false}>
                    {letter}
                </Text>
            ) : showHint ? (
                <Text
                    style={[styles.hintLetter, { fontSize }]}
                    allowFontScaling={false}
                >
                    {hintLetter}
                </Text>
            ) : (
                <View />
            )}
        </Animated.View>
    );
};

export const Tile = memo(TileRaw);

const styles = StyleSheet.create({
    tile: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    borderEmpty: {
        borderWidth: 1,
        borderColor: colors.border,
    },
    borderActive: {
        borderWidth: 2,
        borderColor: colors.textDim,
    },
    borderCursor: {
        borderWidth: 2,
        borderColor: colors.primary,
    },
    borderHint: {
        borderWidth: 2,
        borderColor: colors.warning,
        borderStyle: 'dashed',
    },
    letter: {
        color: colors.text,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
        includeFontPadding: false,
    },
    hintLetter: {
        color: colors.warning,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
        includeFontPadding: false,
        opacity: 0.7,
        fontStyle: 'italic',
    },
});
