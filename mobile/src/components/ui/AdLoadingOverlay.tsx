// Full-screen blocking overlay shown while an ad is loading or playing.
// Two purposes:
//   - Tells the user what's happening (otherwise the brief delay before an
//     ad pops looks like a frozen app).
//   - Blocks input behind it. AdMob takes the foreground itself when
//     the ad actually starts; this covers the gap BEFORE that happens.
//
// Used by:
//   - Daily Bonus button (rewarded ad)
//   - Battle Pass XP Boost (rewarded ad)
//   - Post-match interstitial trigger
//
// DELIBERATELY NOT a react-native <Modal>. A native modal fights with the
// AdMob ad activity/view-controller: on iOS the ad can fail to present
// ("already presenting"), and a modal dismissed while the ad VC is on top
// can silently stay attached — invisible but swallowing every touch, which
// froze the whole screen whenever an ad failed to show. A plain absolute
// View unmounts synchronously with `visible=false`, so it can never wedge.
//
// Don't pass `visible` permanently — the showRewarded / showInterstitial
// helpers should set it true, await ad close, set it false.

import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing } from '../../theme/typography';

interface Props {
    visible: boolean;
    /** Label shown above the spinner — usually "Loading ad…" or similar. */
    label?: string;
}

export const AdLoadingOverlay: React.FC<Props> = ({
    visible,
    label = 'Loading ad…',
}) => {
    const spin = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return;
        const loop = Animated.loop(
            Animated.timing(spin, {
                toValue: 1,
                duration: 1000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        loop.start();
        return () => loop.stop();
    }, [visible, spin]);

    const rotate = spin.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    if (!visible) return null;

    return (
        <View style={styles.backdrop} pointerEvents="auto">
            <View style={styles.card}>
                <Animated.View
                    style={[styles.spinner, { transform: [{ rotate }] }]}
                />
                <Text style={styles.label} allowFontScaling={false}>
                    {label}
                </Text>
                <Text style={styles.hint} allowFontScaling={false}>
                    Please wait a moment…
                </Text>
            </View>
        </View>
    );
};

const styles = makeThemedStyles(() => StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        // Sit above sibling content regardless of mount order.
        zIndex: 9999,
        elevation: 9999,
    },
    card: {
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.xl,
    },
    spinner: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 4,
        borderColor: colors.surfaceElevated,
        borderTopColor: colors.primary,
    },
    label: {
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
    },
    hint: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
    },
}));
