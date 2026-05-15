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
import { colors } from '../../theme/colors';
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
            <Animated.View
                style={[
                    styles.player,
                    { transform: [{ translateX: meSlide }] },
                ]}
            >
                <PlayerCard player={me} side="left" />
            </Animated.View>

            <Animated.View
                style={[
                    styles.vs,
                    { transform: [{ scale: vsScale }] },
                ]}
            >
                <Text style={styles.vsText} allowFontScaling={false}>
                    VS
                </Text>
            </Animated.View>

            <Animated.View
                style={[
                    styles.player,
                    { transform: [{ translateX: oppSlide }] },
                ]}
            >
                <PlayerCard player={opponent} side="right" />
            </Animated.View>
        </View>
    );
};

const PlayerCard: React.FC<{
    player: PublicUser;
    side: 'left' | 'right';
}> = ({ player, side }) => {
    return (
        <View
            style={[
                styles.card,
                side === 'right' ? { alignItems: 'flex-end' } : null,
            ]}
        >
            <View style={styles.avatar}>
                <Ionicons name="person" size={36} color={colors.textDim} />
            </View>
            <Text
                style={styles.username}
                allowFontScaling={false}
                numberOfLines={1}
            >
                {player.username}
            </Text>
            <View style={styles.rankRow}>
                <RankBadge tier={player.rankTier as RankTier} size="sm" />
                <Text style={styles.rankPoints} allowFontScaling={false}>
                    {player.rankPoints}
                </Text>
            </View>
            <Text style={styles.record} allowFontScaling={false}>
                {player.wins}W · {player.losses}L
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.bg,
        zIndex: 100,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
    },
    player: {
        flex: 1,
    },
    card: {
        alignItems: 'flex-start',
        gap: spacing.xs,
    },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.xs,
    },
    username: {
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        maxWidth: 130,
    },
    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    rankPoints: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
    },
    record: {
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
    },
    vs: {
        paddingHorizontal: spacing.sm,
    },
    vsText: {
        color: colors.warning,
        fontSize: 48,
        fontWeight: typography.weights.black,
        letterSpacing: 2,
        textShadowColor: colors.warning,
        textShadowRadius: 12,
    },
});
