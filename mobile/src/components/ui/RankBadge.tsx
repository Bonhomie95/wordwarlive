import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { makeThemedStyles, colors, rankColors, type RankTier } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';

interface Props {
    tier: RankTier;
    points?: number;
    size?: 'sm' | 'md' | 'lg';
}

export const RankBadge: React.FC<Props> = ({ tier, points, size = 'md' }) => {
    const tierColor = rankColors[tier];
    const dim = size === 'sm' ? 18 : size === 'lg' ? 32 : 24;
    const fontSize =
        size === 'sm'
            ? typography.sizes.xs
            : size === 'lg'
            ? typography.sizes.md
            : typography.sizes.sm;
    return (
        <View style={styles.row}>
            <View
                style={[
                    styles.dot,
                    {
                        width: dim,
                        height: dim,
                        borderRadius: dim / 2,
                        backgroundColor: tierColor,
                    },
                ]}
            />
            <View>
                <Text style={[styles.tier, { fontSize, color: tierColor }]} allowFontScaling={false}>
                    {tier.toUpperCase()}
                </Text>
                {points !== undefined ? (
                    <Text style={styles.points} allowFontScaling={false}>
                        {points} pts
                    </Text>
                ) : null}
            </View>
        </View>
    );
};

const styles = makeThemedStyles(() => StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    dot: {
        borderWidth: 2,
        borderColor: colors.border,
    },
    tier: {
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
    },
    points: {
        fontSize: typography.sizes.xs,
        color: colors.textDim,
        fontFamily: typography.familyMono,
    },
}));
