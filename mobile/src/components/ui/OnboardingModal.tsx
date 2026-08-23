// First-run tutorial. WordWar is a 1v1 twist on Wordle, and several
// mechanics (mystery mode, earned power-ups, the hint economy) aren't
// obvious to a new player. This modal runs once, gated by a SecureStore
// flag, and can be re-opened from Settings later if we surface it there.

import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';

interface Slide {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    body: string;
}

const SLIDES: Slide[] = [
    {
        icon: 'flash',
        title: 'Race to solve',
        body: 'You and your opponent get the SAME hidden word. First to crack it wins — with a shared clock ticking down.',
    },
    {
        icon: 'grid',
        title: 'Guess like Wordle',
        body: 'Green = right letter, right spot. Yellow = right letter, wrong spot. Gray = not in the word. You see your opponent’s colors, never their letters.',
    },
    {
        icon: 'sparkles',
        title: 'Modes to explore',
        body: 'Classic ranked 1v1, Mystery Duel (crack each other’s chosen word), a shared Daily Challenge, and private matches with friends.',
    },
    {
        icon: 'eye',
        title: 'Earn power-ups',
        body: 'Win streaks and daily rewards grant Reveal, Scramble, and Lock. Tap them mid-match to gain an edge — they’re earned, never bought.',
    },
    {
        icon: 'bulb',
        title: 'Hints when stuck',
        body: 'Your first-ever hint is free. After that, hints cost coins or credits — one per match. Earn coins by winning and from daily streaks.',
    },
];

interface Props {
    visible: boolean;
    onDone: () => void;
}

export const OnboardingModal: React.FC<Props> = ({ visible, onDone }) => {
    const [index, setIndex] = useState(0);
    const isLast = index === SLIDES.length - 1;
    const slide = SLIDES[index]!;

    function next() {
        if (isLast) {
            setIndex(0);
            onDone();
        } else {
            setIndex((i) => i + 1);
        }
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <Pressable
                        onPress={onDone}
                        accessibilityRole="button"
                        accessibilityLabel="Skip tutorial"
                        style={styles.skip}
                        hitSlop={10}
                    >
                        <Text style={styles.skipText} allowFontScaling={false}>
                            Skip
                        </Text>
                    </Pressable>

                    <View style={styles.iconWrap}>
                        <Ionicons name={slide.icon} size={44} color={colors.primary} />
                    </View>
                    <Text style={styles.title} allowFontScaling={false}>
                        {slide.title}
                    </Text>
                    <Text style={styles.body}>{slide.body}</Text>

                    <View style={styles.dots}>
                        {SLIDES.map((_, i) => (
                            <View
                                key={i}
                                style={[styles.dot, i === index ? styles.dotActive : null]}
                            />
                        ))}
                    </View>

                    <Pressable
                        onPress={next}
                        accessibilityRole="button"
                        accessibilityLabel={isLast ? 'Start playing' : 'Next'}
                        style={({ pressed }) => [
                            styles.cta,
                            pressed ? { opacity: 0.85 } : null,
                        ]}
                    >
                        <Text style={styles.ctaText} allowFontScaling={false}>
                            {isLast ? "Let's play" : 'Next'}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.8)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.lg,
        },
        card: {
            width: '100%',
            maxWidth: 380,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.xl,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            gap: spacing.md,
        },
        skip: {
            position: 'absolute',
            top: spacing.md,
            right: spacing.md,
            padding: 4,
        },
        skipText: {
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
        },
        iconWrap: {
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: spacing.md,
        },
        title: {
            color: colors.text,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.black,
            textAlign: 'center',
        },
        body: {
            color: colors.textDim,
            fontSize: typography.sizes.md,
            textAlign: 'center',
            lineHeight: 22,
        },
        dots: {
            flexDirection: 'row',
            gap: 6,
            marginVertical: spacing.xs,
        },
        dot: {
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.border,
        },
        dotActive: {
            backgroundColor: colors.primary,
            width: 18,
        },
        cta: {
            width: '100%',
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            alignItems: 'center',
        },
        ctaText: {
            color: colors.bg,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.black,
            letterSpacing: 0.5,
        },
    })
);
