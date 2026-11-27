// Welcome screen: a phone playing a real match on loop, so first-time
// players see the game before signing up. The clip is an animated WebP cut
// from an actual recording (no ads, no status bar) and shown with expo-image:
// no video player, so nothing touches the audio session the game's sounds
// rely on. Fills the space it's given; a still frame under Reduce Motion.

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeThemedStyles, colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';

const CLIP = require('../../../assets/preview/gameplay.webp');
/** Width / height of the clip (480 x 810). */
const ASPECT = 480 / 810;
const BEZEL = 7;
const TOP_BEZEL = 16;
const MAX_HEIGHT = 470;

export function GameplayPreview() {
    const reduced = useReducedMotion();
    const [space, setSpace] = useState(0);
    const screenH = Math.min(space - spacing.md * 2 - TOP_BEZEL - BEZEL, MAX_HEIGHT);
    const screenW = screenH * ASPECT;
    return (
        <View style={styles.area} onLayout={(e) => setSpace(e.nativeEvent.layout.height)}>
            {screenH > 140 ? (
                <View
                    style={[styles.phone, { width: screenW + BEZEL * 2, paddingTop: TOP_BEZEL }]}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel="Preview of a WordWar match: guessing a five-letter word before the opponent"
                >
                    <View style={styles.speaker} />
                    <Image
                        source={CLIP}
                        style={{ width: screenW, height: screenH, borderRadius: 18 }}
                        contentFit="cover"
                        autoplay={!reduced}
                        accessible={false}
                    />
                </View>
            ) : null}
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    area: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
    phone: {
        alignItems: 'center',
        backgroundColor: '#07080a',
        borderRadius: 26,
        padding: BEZEL,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.primary,
        shadowOpacity: 0.35,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 },
        elevation: 10,
    },
    speaker: {
        position: 'absolute',
        top: 6,
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#22262d',
    },
}));
