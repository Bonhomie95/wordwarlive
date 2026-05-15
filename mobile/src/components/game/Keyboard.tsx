import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';
import type { Tile as TileColor } from '../../types/index';

const ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

interface Props {
    onLetter: (l: string) => void;
    onEnter: () => void;
    onBackspace: () => void;
    /** Best-known status for each letter, derived from prior guesses. */
    letterStates: Record<string, TileColor | undefined>;
    /** Disable input (during submission, post-game, etc). */
    disabled?: boolean;
}

const KeyRaw: React.FC<{
    label: string;
    onPress: () => void;
    state?: TileColor;
    flex?: number;
    disabled?: boolean;
}> = ({ label, onPress, state, flex = 1, disabled }) => {
    const bg = state
        ? state === 'correct'
            ? colors.tileCorrect
            : state === 'misplaced'
            ? colors.tileMisplaced
            : colors.tileWrong
        : colors.surfaceElevated;
    const fg = state ? colors.text : colors.text;

    return (
        <Pressable
            onPress={() => {
                if (disabled) return;
                Haptics.selectionAsync().catch(() => {});
                onPress();
            }}
            disabled={disabled}
            style={({ pressed }) => [
                styles.key,
                { backgroundColor: bg, flex, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
            ]}
        >
            <Text style={[styles.keyLabel, { color: fg }]} allowFontScaling={false}>
                {label}
            </Text>
        </Pressable>
    );
};

const Key = memo(KeyRaw);

const KeyboardRaw: React.FC<Props> = ({
    onLetter,
    onEnter,
    onBackspace,
    letterStates,
    disabled,
}) => {
    const rows = useMemo(() => ROWS, []);
    return (
        <View style={styles.kb}>
            {rows.map((row, i) => (
                <View key={`kbrow-${i}`} style={styles.row}>
                    {row.map((label) => {
                        if (label === 'ENTER') {
                            return (
                                <Key
                                    key={label}
                                    label="ENTER"
                                    onPress={onEnter}
                                    flex={1.6}
                                    disabled={disabled}
                                />
                            );
                        }
                        if (label === 'BACKSPACE') {
                            return (
                                <Key
                                    key={label}
                                    label="⌫"
                                    onPress={onBackspace}
                                    flex={1.6}
                                    disabled={disabled}
                                />
                            );
                        }
                        return (
                            <Key
                                key={label}
                                label={label}
                                onPress={() => onLetter(label)}
                                state={letterStates[label]}
                                disabled={disabled}
                            />
                        );
                    })}
                </View>
            ))}
        </View>
    );
};

export const Keyboard = memo(KeyboardRaw);

/** Compute the best-known per-letter color from a list of prior guesses.
 *  Priority: correct > misplaced > wrong. */
export function deriveLetterStates(
    guesses: { guess: string; tiles: TileColor[] }[]
): Record<string, TileColor | undefined> {
    const out: Record<string, TileColor | undefined> = {};
    const priority: Record<TileColor, number> = {
        wrong: 1,
        misplaced: 2,
        correct: 3,
    };
    for (const g of guesses) {
        for (let i = 0; i < g.guess.length; i++) {
            const letter = g.guess[i]!;
            const tile = g.tiles[i]!;
            const existing = out[letter];
            if (!existing || priority[tile] > priority[existing]) {
                out[letter] = tile;
            }
        }
    }
    return out;
}

const styles = StyleSheet.create({
    kb: {
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
    },
    row: {
        flexDirection: 'row',
        gap: spacing.xs,
        justifyContent: 'center',
    },
    key: {
        height: 42,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keyLabel: {
        fontWeight: typography.weights.bold,
        fontSize: typography.sizes.sm,
        letterSpacing: 0.5,
    },
});
