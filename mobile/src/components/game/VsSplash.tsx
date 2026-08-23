// "You vs Opponent" splash. Shown briefly (2.5s) after match_found before
// the grid renders. Gives both players a moment to see who they're up
// against — feels more like a competitive match and less like a faceless
// matchmaker.
//
// Triggered by the match screen when phase === 'matched'. Auto-dismisses;
// the gameStore flips to 'playing' on its own when the server sends
// match_start.

import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';
import { RankBadge } from '../ui/RankBadge';
import type { PublicUser, RankTier } from '../../types/index';

interface Props {
    me: PublicUser;
    opponent: PublicUser;
}

export const VsSplash: React.FC<Props> = ({ me, opponent }) => {
    const meSlide = useRef(new Animated.Value(-100)).current;
    const oppSlide = useRef(new Animated.Value(100)).current;
    const vsScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Players slide in from opposite sides; VS punches in last.
        Animated.parallel([
            Animated.timing(meSlide, {
                toValue: 0,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(oppSlide, {
                toValue: 0,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.sequence([
                Animated.delay(200),
                Animated.spring(vsScale, {
                    toValue: 1,
                    friction: 4,
                    tension: 80,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, [meSlide, oppSlide, vsScale]);

    return (
        <View style={styles.root}>
            <Animated.View style={{ transform: [{ translateX: meSlide }], width: '100%' }}>
                <PlayerCard player={me} label="YOU" accent={colors.primary} />
            </Animated.View>

            <Animated.View style={[styles.vs, { transform: [{ scale: vsScale }] }]}>
                <View style={styles.vsBadge}>
                    <Text style={styles.vsText} allowFontScaling={false}>
                        VS
                    </Text>
                </View>
            </Animated.View>

            <Animated.View style={{ transform: [{ translateX: oppSlide }], width: '100%' }}>
                <PlayerCard player={opponent} label="NEMESIS" accent={colors.danger} />
            </Animated.View>
        </View>
    );
};

const PlayerCard: React.FC<{
    player: PublicUser;
    label: string;
    accent: string;
}> = ({ player, label, accent }) => {
    return (
        <View style={[styles.card, { borderColor: accent + '55' }]}>
            <View style={[styles.avatar, { borderColor: accent }]}>
                <Ionicons name="person" size={34} color={accent} />
            </View>
            <View style={styles.cardInfo}>
                <Text style={[styles.label, { color: accent }]} allowFontScaling={false}>
                    {label}
                </Text>
                <Text style={styles.username} allowFontScaling={false} numberOfLines={1}>
                    {player.username}
                </Text>
                <View style={styles.rankRow}>
                    <RankBadge tier={player.rankTier as RankTier} size="sm" />
                    <Text style={styles.record} allowFontScaling={false}>
                        {player.wins}W · {player.losses}L · {winPct(player.wins, player.losses)}%
                    </Text>
                </View>
            </View>
        </View>
    );
};

function winPct(wins: number, losses: number): number {
    const total = wins + losses;
    if (total === 0) return 0;
    return Math.round((wins / total) * 100);
}

const styles = makeThemedStyles(() => StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.bg,
        zIndex: 100,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        gap: spacing.md,
    },
    card: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: spacing.lg,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardInfo: { flex: 1, gap: 3 },
    label: {
        fontFamily: typography.familyMono,
        fontSize: 11,
        letterSpacing: 2,
    },
    username: {
        color: colors.text,
        fontFamily: typography.familyDisplay,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.black,
    },
    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    record: {
        color: colors.textMuted,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.xs,
    },
    vs: {
        marginVertical: spacing.xs,
    },
    vsBadge: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.warning,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.warning,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 16,
        elevation: 8,
    },
    vsText: {
        color: colors.bg,
        fontFamily: typography.familyDisplay,
        fontSize: 26,
        fontWeight: typography.weights.black,
        letterSpacing: 1,
    },
}));
