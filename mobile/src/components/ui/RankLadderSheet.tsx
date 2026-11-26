// Tap your rank → the whole ladder: every tier from Stone to Legend with the
// RP it starts at, where you are, and how far the next one is.

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { RankBadge } from './RankBadge';
import { ProgressBar } from './ProgressBar';
import { TIER_BANDS, nextThreshold, tierIndex, winsFor, RP_PER_EVEN_WIN } from '../../lib/ranks';
import { track } from '../../observability';
import { makeThemedStyles, colors, rankColors, type RankTier } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

const label = (t: RankTier) => t.toUpperCase();

export const RankLadderSheet: React.FC<{ visible: boolean; onClose: () => void; points: number; tier: RankTier }> = ({
    visible,
    onClose,
    points,
    tier,
}) => {
    useEffect(() => {
        if (visible) track('rank_ladder_view');
    }, [visible]);
    const { nextTier, needed, progress } = nextThreshold(points);
    const mine = tierIndex(tier);

    return (
        <Sheet visible={visible} title="Rank ladder" onClose={onClose}>
            <View style={styles.summary}>
                <View style={styles.summaryRow}>
                    <RankBadge tier={tier} size="lg" />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.summaryTier, { color: rankColors[tier] }]} allowFontScaling={false}>
                            {label(tier)}
                        </Text>
                        <Text style={styles.summaryPoints} allowFontScaling={false}>
                            {points.toLocaleString()} RP
                        </Text>
                    </View>
                </View>
                <ProgressBar progress={progress} label="Progress to next rank" />
                <Text style={styles.summaryNext} allowFontScaling={false}>
                    {nextTier
                        ? `${needed.toLocaleString()} RP to ${label(nextTier)} · about ${winsFor(needed)} ${winsFor(needed) === 1 ? 'win' : 'wins'}`
                        : 'You are at the top tier. Keep winning to stay there.'}
                </Text>
            </View>

            <View style={styles.ladder}>
                {[...TIER_BANDS].reverse().map((band) => {
                    const i = tierIndex(band.tier);
                    const here = i === mine;
                    const reached = i < mine;
                    const away = band.min - points;
                    return (
                        <View key={band.tier} style={[styles.row, here && { borderColor: rankColors[band.tier], backgroundColor: colors.surfaceElevated }]}>
                            <RankBadge tier={band.tier} size="sm" />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTier, here && { color: rankColors[band.tier] }]} allowFontScaling={false}>
                                    {label(band.tier)}
                                </Text>
                                <Text style={styles.rowMin} allowFontScaling={false}>
                                    {band.min === 0 ? 'Starting rank' : `From ${band.min.toLocaleString()} RP`}
                                </Text>
                            </View>
                            {here ? (
                                <Text style={[styles.status, { color: rankColors[band.tier] }]} allowFontScaling={false}>
                                    YOU
                                </Text>
                            ) : reached ? (
                                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                            ) : (
                                <View style={styles.lockRow}>
                                    <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
                                    <Text style={styles.away} allowFontScaling={false}>
                                        {away.toLocaleString()} RP
                                    </Text>
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>

            <Text style={styles.note} allowFontScaling={false}>
                A win against an equal opponent is about +{RP_PER_EVEN_WIN} RP (more for beating a stronger
                player, half against a bot). A loss costs about the same. Climb a tier and you meet tougher
                opponents.
            </Text>
        </Sheet>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        summary: {
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
        },
        summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        summaryTier: { fontFamily: typography.familyDisplay, fontWeight: typography.weights.black, fontSize: typography.sizes.xl },
        summaryPoints: { color: colors.textMuted, fontFamily: typography.familyMono, fontSize: typography.sizes.sm },
        summaryNext: { color: colors.text, fontFamily: typography.familyMono, fontSize: typography.sizes.sm },
        ladder: { gap: 6 },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: 10,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        rowTier: { color: colors.text, fontFamily: typography.familyDisplay, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
        rowMin: { color: colors.textMuted, fontFamily: typography.familyMono, fontSize: typography.sizes.xs },
        status: { fontFamily: typography.familyMono, fontWeight: typography.weights.bold, fontSize: typography.sizes.xs, letterSpacing: 1 },
        lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        away: { color: colors.textMuted, fontFamily: typography.familyMono, fontSize: typography.sizes.xs },
        note: { color: colors.textMuted, fontFamily: typography.familyMono, fontSize: typography.sizes.xs, lineHeight: 17 },
    })
);
