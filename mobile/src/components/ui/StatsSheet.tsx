// Tap a stat tile (or the streak pill) → the full picture: record, win
// streaks, the daily play streak and what it pays, and recent form.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { matchesApi } from '../../api/resources';
import type { MeResponse, RecentMatch } from '../../types/index';
import { track } from '../../observability';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

/** Mirrors server/src/services/streakService.ts MILESTONES. */
const MILESTONES = [
    { day: 5, coins: 50, hints: 1 },
    { day: 10, coins: 100, hints: 2 },
    { day: 25, coins: 250, hints: 5 },
    { day: 50, coins: 500, hints: 10 },
    { day: 100, coins: 1000, hints: 20 },
];

export type StatsFocus = 'record' | 'streak';

export const StatsSheet: React.FC<{ visible: boolean; onClose: () => void; me: MeResponse; focus?: StatsFocus }> = ({
    visible,
    onClose,
    me,
    focus = 'record',
}) => {
    const [recent, setRecent] = useState<RecentMatch[] | null>(null);
    useEffect(() => {
        if (!visible) return;
        track('stats_view', { offer: focus });
        matchesApi.recent(10).then((r) => setRecent(r.matches)).catch(() => setRecent([]));
    }, [visible, focus]);

    const games = me.wins + me.losses;
    const winRate = games ? Math.round((me.wins / games) * 100) : 0;
    const ratio = me.losses ? (me.wins / me.losses).toFixed(2) : String(me.wins);
    const play = me.streak.playStreak;
    const next = MILESTONES.find((m) => m.day > play);

    const streakCard = (
        <View style={styles.card} key="streak">
            <View style={styles.cardHead}>
                <Ionicons name="flame" size={16} color={colors.warning} />
                <Text style={styles.cardTitle} allowFontScaling={false}>
                    Daily streak
                </Text>
            </View>
            <View style={styles.pair}>
                <Big value={`${play}`} label={play === 1 ? 'day in a row' : 'days in a row'} />
                <Big value={`${me.streak.playStreakBest}`} label="best" />
            </View>
            <Text style={styles.body} allowFontScaling={false}>
                Finish at least one match every day (days run midnight to midnight UTC) to grow it. Each new
                day pays +10 coins.
                {next ? ` Day ${next.day}: +${next.coins} coins and ${next.hints} free ${next.hints === 1 ? 'hint' : 'hints'}.` : ''}
                {me.boosts.streakShields > 0
                    ? ` You have ${me.boosts.streakShields} streak ${me.boosts.streakShields === 1 ? 'shield' : 'shields'}: each one saves your streak if you miss a day.`
                    : ' Streak shields from the shop save your streak if you miss a day.'}
            </Text>
        </View>
    );

    const recordCard = (
        <View style={styles.card} key="record">
            <View style={styles.cardHead}>
                <Ionicons name="stats-chart" size={16} color={colors.primary} />
                <Text style={styles.cardTitle} allowFontScaling={false}>
                    Record
                </Text>
            </View>
            <View style={styles.pair}>
                <Big value={`${winRate}%`} label="win rate" />
                <Big value={ratio} label="wins per loss" />
                <Big value={`${games}`} label="games" />
            </View>
            <View style={styles.pair}>
                <Big value={`${me.wins}`} label="wins" color={colors.primary} />
                <Big value={`${me.losses}`} label="losses" color={colors.danger} />
            </View>
            <View style={styles.pair}>
                <Big value={`${me.winStreak}`} label="current win streak" />
                <Big value={`${me.bestStreak}`} label="best win streak" />
            </View>
        </View>
    );

    const formCard = (
        <View style={styles.card} key="form">
            <View style={styles.cardHead}>
                <Ionicons name="pulse" size={16} color={colors.info} />
                <Text style={styles.cardTitle} allowFontScaling={false}>
                    Last 10 matches
                </Text>
            </View>
            {recent === null ? (
                <Text style={styles.body} allowFontScaling={false}>
                    Loading…
                </Text>
            ) : recent.length === 0 ? (
                <Text style={styles.body} allowFontScaling={false}>
                    Play a match to start your form guide.
                </Text>
            ) : (
                <>
                    <View style={styles.formRow}>
                        {recent.map((m) => (
                            <View key={m.id} style={[styles.formChip, { backgroundColor: m.isWin ? colors.primary : colors.surfaceElevated }]}>
                                <Text style={[styles.formText, { color: m.isWin ? colors.bg : colors.textDim }]} allowFontScaling={false}>
                                    {m.isWin ? 'W' : 'L'}
                                </Text>
                            </View>
                        ))}
                    </View>
                    <Text style={styles.body} allowFontScaling={false}>
                        {`${recent.filter((m) => m.isWin).length} wins · ${recent.reduce((n, m) => n + m.rankDelta, 0) >= 0 ? '+' : ''}${recent.reduce((n, m) => n + m.rankDelta, 0)} RP over these games. Newest first.`}
                    </Text>
                </>
            )}
        </View>
    );

    return (
        <Sheet visible={visible} title={focus === 'streak' ? 'Your streak' : 'Your stats'} onClose={onClose}>
            {focus === 'streak' ? [streakCard, recordCard, formCard] : [recordCard, formCard, streakCard]}
        </Sheet>
    );
};

const Big: React.FC<{ value: string; label: string; color?: string }> = ({ value, label, color }) => (
    <View style={styles.big}>
        <Text style={[styles.bigValue, color ? { color } : null]} allowFontScaling={false}>
            {value}
        </Text>
        <Text style={styles.bigLabel} allowFontScaling={false}>
            {label}
        </Text>
    </View>
);

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        card: {
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
        },
        cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        cardTitle: { color: colors.text, fontFamily: typography.familyDisplay, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
        pair: { flexDirection: 'row', gap: spacing.md },
        big: { flex: 1 },
        bigValue: { color: colors.text, fontFamily: typography.familyDisplay, fontWeight: typography.weights.black, fontSize: typography.sizes.xl },
        bigLabel: { color: colors.textMuted, fontFamily: typography.familyMono, fontSize: typography.sizes.xs },
        body: { color: colors.textDim, fontFamily: typography.familyMono, fontSize: typography.sizes.xs, lineHeight: 17 },
        formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        formChip: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
        formText: { fontFamily: typography.familyMono, fontWeight: typography.weights.bold, fontSize: typography.sizes.xs },
    })
);
