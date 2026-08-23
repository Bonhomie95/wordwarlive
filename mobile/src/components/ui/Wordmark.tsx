// The "WordWar" wordmark — bold display type with "War" in glowing neon.
// Used on the welcome screen and the app top bar.

import React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

interface Props {
    size?: number;
    style?: TextStyle;
}

export const Wordmark: React.FC<Props> = ({ size = 34, style }) => {
    return (
        <View style={styles.row}>
            <Text
                style={[styles.word, { fontSize: size }, style]}
                allowFontScaling={false}
            >
                Word
                <Text style={styles.accent}>War</Text>
            </Text>
        </View>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center' },
        word: {
            color: colors.text,
            fontFamily: typography.familyDisplay,
            fontWeight: typography.weights.black,
            letterSpacing: -0.5,
        },
        accent: {
            color: colors.primary,
            textShadowColor: colors.primary,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 14,
        },
    })
);
