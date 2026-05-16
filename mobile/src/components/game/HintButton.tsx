// HintButton — shown next to the player's grid during a match. Displays the
// current cost (Free / 1 credit / 50 coins) and dispatches the hint request
// through the game store.
//
// State machine:
//   freeHintAvailable  → "FREE"
//   hintCredits > 0    → "1 hint credit"
//   coins >= 50        → "50 coins"
//   else               → disabled "Need 50 coins"

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';

interface Props {
    freeAvailable: boolean;
    hintCredits: number;
    coins: number;
    hintCost: number;
    /** How many hints the player has already used in this match. */
    hintsUsed: number;
    /** Total hints available this match (1 for short words, 2 for long). */
    hintsCap: number;
    onPress: () => void;
    busy?: boolean;
    /** Hide the button entirely (e.g. cap reached or all positions revealed). */
    hidden?: boolean;
}

export const HintButton: React.FC<Props> = ({
    freeAvailable,
    hintCredits,
    coins,
    hintCost,
    hintsUsed,
    hintsCap,
    onPress,
    busy,
    hidden,
}) => {
    if (hidden) return null;

    // Main label shows progress when there's more than one available — gives
    // long-word players visibility into how many they've got left.
    const mainLabel = hintsCap > 1 ? `Hint ${hintsUsed + 1}/${hintsCap}` : 'Hint';

    let sublabel: string;
    let disabled = false;
    if (freeAvailable) {
        sublabel = 'FREE';
    } else if (hintCredits > 0) {
        sublabel = `1 of ${hintCredits} credits`;
    } else if (coins >= hintCost) {
        sublabel = `${hintCost} coins`;
    } else {
        sublabel = `Need ${hintCost} coins`;
        disabled = true;
    }

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled || busy}
            style={({ pressed }) => [
                styles.btn,
                disabled ? styles.btnDisabled : null,
                freeAvailable ? styles.btnFree : null,
                pressed && !disabled ? { opacity: 0.85 } : null,
                busy ? { opacity: 0.6 } : null,
            ]}
        >
            <Ionicons
                name="bulb"
                size={16}
                color={freeAvailable ? colors.warning : colors.text}
            />
            <View style={styles.labelWrap}>
                <Text style={styles.label} allowFontScaling={false}>
                    {mainLabel}
                </Text>
                <Text
                    style={[
                        styles.sub,
                        freeAvailable ? { color: colors.warning } : null,
                        disabled ? { color: colors.danger } : null,
                    ]}
                    allowFontScaling={false}
                >
                    {sublabel}
                </Text>
            </View>
        </Pressable>
    );
};

const styles = makeThemedStyles(() => StyleSheet.create({
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
    },
    btnFree: {
        borderColor: colors.warning,
    },
    btnDisabled: {
        opacity: 0.6,
    },
    labelWrap: {
        gap: 2,
    },
    label: {
        color: colors.text,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
    },
    sub: {
        color: colors.textDim,
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: typography.weights.semibold,
    },
}));
