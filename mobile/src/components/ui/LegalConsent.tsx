// "By continuing you agree to…" line shown wherever an account can be created
// (welcome + register). Apple 1.2 (UGC) requires users to agree to terms; both
// stores require the privacy policy to be reachable in-app.

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing } from '../../theme/typography';
import { openLegal, PRIVACY_URL, TERMS_URL } from '../../lib/links';

export const LegalConsent: React.FC = () => (
    <Text style={styles.text} allowFontScaling={false}>
        By continuing you agree to our{' '}
        <Text
            style={styles.link}
            onPress={() => openLegal(TERMS_URL)}
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
        >
            Terms of Service
        </Text>{' '}
        and{' '}
        <Text
            style={styles.link}
            onPress={() => openLegal(PRIVACY_URL)}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
        >
            Privacy Policy
        </Text>
        .
    </Text>
);

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        text: {
            textAlign: 'center',
            color: colors.textMuted,
            fontFamily: typography.family,
            fontSize: typography.sizes.xs,
            lineHeight: 17,
            marginTop: spacing.xs,
        },
        link: { color: colors.textDim, textDecorationLine: 'underline' },
    })
);
