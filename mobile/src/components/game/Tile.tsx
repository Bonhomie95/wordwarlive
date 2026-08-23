import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { makeThemedStyles, colors, useThemeStore } from '../../theme/colors';
import { typography, radius } from '../../theme/typography';
import { glow } from '../../theme/effects';
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
    /** Optional color palette from an equipped board_theme cosmetic.
     *  Overrides the default theme tile colors when set. The render_data
     *  for board themes ships {bg, correct, misplaced, wrong} as hex strings. */
    boardOverride?: {
        correct?: string;
        misplaced?: string;
        wrong?: string;
        bg?: string;
    } | null;
}

const TileRaw: React.FC<Props> = ({
    letter,
    state,
    hideLetter,
    size = 'lg',
    revealDelayMs = 0,
    hintLetter,
    cursor,
    boardOverride,
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

    // Resolve the color palette: override beats default per-key, so a
    // theme that defines only `correct` still inherits the rest. Colors are
    // read at render time (not module load) so theme swaps propagate.
    // Exception: color-blind mode wins over cosmetic board themes — an
    // equipped theme's own green/yellow would defeat the accessible palette.
    const colorBlind = useThemeStore((s) => s.colorBlind);
    const palette: Record<TileColor, string> = {
        correct: (colorBlind ? null : boardOverride?.correct) ?? colors.tileCorrect,
        misplaced: (colorBlind ? null : boardOverride?.misplaced) ?? colors.tileMisplaced,
        wrong: boardOverride?.wrong ?? colors.tileWrong,
    };

    // Pre-resolve every color the worklet needs into plain string locals.
    // Reanimated worklets serialize and FREEZE any object they capture —
    // if the worklet read `colors.surfaceElevated` directly it would
    // freeze the shared `colors` object, and the theme switcher's in-place
    // mutation would then throw "Tried to modify key of a frozen object".
    // Capturing primitive strings sidesteps that entirely.
    const filledBg = colors.surfaceElevated;
    const emptyBg = boardOverride?.bg ?? colors.tileEmpty;
    const stateBg = state ? palette[state] : null;

    const animatedStyle = useAnimatedStyle(() => {
        const scaleY = interpolate(flip.value, [0, 0.5, 1], [1, 0.6, 1]);
        const bgColor = stateBg ?? (letter ? filledBg : emptyBg);
        return {
            backgroundColor: bgColor,
            transform: [{ scaleY }],
        };
    });

    // Resolve size: numeric → pixel value; 'sm' → 22; 'lg' → 48.
    const dim = typeof size === 'number' ? size : size === 'sm' ? 22 : 48;
    const isSmall = dim < 28;
    // Font scales with tile size — ~0.4× — so 4-letter tiles aren't huge and
    // 10-letter tiles still look proportionate.
    const fontSize = isSmall ? 0 : Math.round(dim * 0.4);
    const showLetter = !hideLetter && !!letter && !isSmall;
    const showHint = !hideLetter && !letter && !!hintLetter && !isSmall;
    const borderRadius = isSmall ? 3 : Math.min(radius.md, dim / 6);
    // Bright tile backgrounds (green/gold/orange/blue) read best with dark
    // text; the dark "wrong" tile and empty/filled cells use light text.
    const letterColor =
        state === 'correct' || state === 'misplaced' ? colors.bg : colors.text;

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
                // Neon bloom on a solved (green) tile.
                state === 'correct' && !isSmall ? glow(palette.correct, 10, 0.7) : null,
                cursor && !isSmall ? glow(colors.primary, 8, 0.5) : null,
                animatedStyle,
            ]}
        >
            {showLetter ? (
                <Text
                    style={[styles.letter, { fontSize, color: letterColor }]}
                    allowFontScaling={false}
                >
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

const styles = makeThemedStyles(() => StyleSheet.create({
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
        fontFamily: typography.familyDisplay,
        fontWeight: typography.weights.black,
        letterSpacing: 1,
        includeFontPadding: false,
    },
    hintLetter: {
        color: colors.warning,
        fontFamily: typography.familyMono,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
        includeFontPadding: false,
        opacity: 0.7,
    },
}));
