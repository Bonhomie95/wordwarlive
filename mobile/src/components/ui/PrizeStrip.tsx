// What the top 100 of a leaderboard win when it closes, with a countdown and,
// when the player is in the prizes, what they'd win if it closed now.

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LeaderboardPrize } from '../../types/index';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

export function prizeForRank(prizes: LeaderboardPrize[], rank: number | null | undefined): number {
    if (!rank) return 0;
    return prizes.find((p) => rank >= p.from && rank <= p.to)?.coins ?? 0;
}

function timeLeft(endsAt: string, now: number): string {
    const min = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 60_000));
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    if (d > 0) return `${d}d ${h}h`;
    return h > 0 ? `${h}h ${min % 60}m` : `${min % 60}m`;
}

export const PrizeStrip: React.FC<{
    prizes: LeaderboardPrize[];
    endsAt?: string | null;
    yourRank?: number | null;
    /** One line ("Top 100 solvers win up to 150 coins") instead of the table. */
    compact?: boolean;
    who?: string;
}> = ({ prizes, endsAt, yourRank, compact, who = 'players' }) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);
    if (!prizes.length) return null;
    const ends = endsAt ? `Ends in ${timeLeft(endsAt, now)}` : null;

    if (compact) {
        return (
            <View style={styles.compact}>
                <Ionicons name="trophy" size={13} color={colors.warning} />
                <Text style={styles.compactText} allowFontScaling={false}>
                    Top 100 {who} win up to {prizes[0]!.coins} coins{ends ? ` · ${ends.toLowerCase()}` : ''}
                </Text>
            </View>
        );
    }

    const mine = prizeForRank(prizes, yourRank);
    return (
        <View style={styles.card}>
            <View style={styles.head}>
                <Ionicons name="trophy" size={14} color={colors.warning} />
                <Text style={styles.title} allowFontScaling={false}>
                    TOP 100 WIN COINS
                </Text>
                {ends ? (
                    <Text style={styles.ends} allowFontScaling={false}>
                        {ends}
                    </Text>
                ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {prizes.map((p) => {
                    const isMine = !!yourRank && yourRank >= p.from && yourRank <= p.to;
                    return (
                        <View key={p.from} style={[styles.chip, isMine ? styles.chipMine : null]}>
                            <Text style={styles.chipRank} allowFontScaling={false}>
                                {p.from === p.to ? ordinal(p.from) : `${p.from}–${p.to}`}
                            </Text>
                            <View style={styles.chipCoins}>
                                <Ionicons name="ellipse" size={8} color={colors.warning} />
                                <Text style={styles.chipCoinsText} allowFontScaling={false}>
                                    {p.coins}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
            {mine ? (
                <Text style={styles.mine} allowFontScaling={false}>
                    You&apos;re #{yourRank}: {mine} coins if it ended now
                </Text>
            ) : null}
        </View>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        card: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingVertical: spacing.sm,
            marginHorizontal: spacing.md,
            marginBottom: spacing.sm,
            gap: spacing.xs,
        },
        head: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: spacing.md,
        },
        title: {
            color: colors.warning,
            fontFamily: typography.familyMono,
            fontSize: 11,
            letterSpacing: 1.2,
            fontWeight: '700',
        },
        ends: {
            marginLeft: 'auto',
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 11,
        },
        chips: {
            gap: 6,
            paddingHorizontal: spacing.md,
        },
        chip: {
            alignItems: 'center',
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
        },
        chipMine: {
            borderColor: colors.primary,
        },
        chipRank: {
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 10,
        },
        chipCoins: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
        },
        chipCoinsText: {
            color: colors.text,
            fontFamily: typography.familyDisplay,
            fontWeight: typography.weights.bold,
            fontSize: typography.sizes.sm,
        },
        mine: {
            color: colors.primary,
            fontFamily: typography.familyMono,
            fontSize: 11,
            paddingHorizontal: spacing.md,
        },
        compact: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginBottom: spacing.sm,
        },
        compactText: {
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 11,
        },
    })
);
