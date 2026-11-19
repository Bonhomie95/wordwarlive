// Cold-start intro. Takes over from the native splash with the same logo in
// the same spot, spells WORDWAR in game tiles that flip green like a solved
// word while the app loads underneath, then fades out once the app is ready
// and the reveal has played.

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
    FadeIn,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { Tile } from '../game/Tile';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const LETTERS = 'WORDWAR'.split('');
const MIN_SHOW_MS = 1700;

let resolveLaunch: () => void = () => {};
/** Resolves when the intro has faded out, so popups wait for it. */
export const launchFinished = new Promise<void>((resolve) => {
    resolveLaunch = resolve;
});

export const LaunchScreen: React.FC<{
    /** App hydrated and fonts loaded. */
    ready: boolean;
    fontsReady: boolean;
    onDone: () => void;
}> = ({ ready, fontsReady, onDone }) => {
    const reduced = useReducedMotion();
    const { width } = useWindowDimensions();
    const tile = Math.min(44, Math.floor((width - 64 - 6 * 6) / 7));
    // The logo slides up by `lift`; the tiles sit 18px under its visible
    // edge (the logo art fills the middle 74% of its 220px box: ±81px).
    const lift = Math.round(tile * 1.4);
    const [minElapsed, setMinElapsed] = useState(false);
    const opacity = useSharedValue(1);
    const logoY = useSharedValue(0);

    useEffect(() => {
        const t = setTimeout(() => setMinElapsed(true), reduced ? 300 : MIN_SHOW_MS);
        logoY.value = reduced ? -lift : withDelay(150, withTiming(-lift, { duration: 450 }));
        return () => clearTimeout(t);
    }, [reduced, lift, logoY]);

    useEffect(() => {
        if (!ready || !minElapsed) return;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            resolveLaunch();
            onDone();
        };
        opacity.value = withTiming(0, { duration: reduced ? 0 : 350 }, (done) => {
            if (done) runOnJS(finish)();
        });
        // Never let the intro outlive the fade, even if the callback is lost.
        const safety = setTimeout(finish, 800);
        return () => clearTimeout(safety);
    }, [ready, minElapsed, reduced, opacity, onDone]);

    const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
    const logo = useAnimatedStyle(() => ({ transform: [{ translateY: logoY.value }] }));

    return (
        <Animated.View
            style={[StyleSheet.absoluteFill, styles.root, fade]}
            // Our first frame matches the native splash, so hand over now.
            onLayout={() => SplashScreen.hideAsync().catch(() => {})}
        >
            <Animated.View style={logo}>
                <Image source={require('../../../assets/splash-logo.png')} style={styles.logo} resizeMode="contain" />
            </Animated.View>
            {fontsReady ? (
                <View style={[styles.below, { marginTop: 81 - lift + 18 }]}>
                    <View style={styles.tiles}>
                        {LETTERS.map((letter, i) => (
                            <Tile
                                key={i}
                                letter={letter}
                                state="correct"
                                size={tile}
                                revealDelayMs={reduced ? 0 : 350 + i * 90}
                                bounceDelayMs={reduced ? undefined : 1050 + i * 60}
                            />
                        ))}
                    </View>
                    <Animated.Text
                        entering={reduced ? undefined : FadeIn.delay(1000).duration(400)}
                        style={styles.tagline}
                        allowFontScaling={false}
                    >
                        REAL-TIME 1V1 WORD DUELS
                    </Animated.Text>
                </View>
            ) : null}
        </Animated.View>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        root: {
            backgroundColor: colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
        },
        // Same size and centre as the native splash (expo-splash-screen imageWidth 220).
        logo: { width: 220, height: 220 },
        below: {
            position: 'absolute',
            top: '50%',
            alignItems: 'center',
            gap: 14,
        },
        tiles: { flexDirection: 'row', gap: 6 },
        tagline: {
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 12,
            letterSpacing: 2,
        },
    })
);
