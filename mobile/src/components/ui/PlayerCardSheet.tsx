// Tap a leaderboard player: their place on the daily, weekly, monthly and
// all-time boards (for the mode being viewed), and Classic / Mystery
// challenge buttons.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from './Pressable';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { leaderboardApi } from '../../api/resources';
import { useGameStore } from '../../store/gameStore';
import { makeThemedStyles, colors, type RankTier } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';
import type { LeaderboardEntry, LeaderboardPeriod, PlayerRecords } from '../../types/index';

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'all_time', label: 'All-time' },
];
const MODE_LABEL = { overall: 'All modes', classic: 'Classic', mystery: 'Mystery' } as const;

export function PlayerCardSheet({
    entry,
    mode,
    period,
    isMe,
    onClose,
}: {
    entry: LeaderboardEntry | null;
    mode: 'overall' | 'classic' | 'mystery';
    period: LeaderboardPeriod;
    isMe: boolean;
    onClose: () => void;
}) {
    return (
        <Sheet visible={!!entry} title={entry?.username ?? ''} onClose={onClose}>
            {/* Keyed by player and mode, so each card starts fresh. */}
            {entry ? <CardBody key={`${entry.userId}:${mode}`} entry={entry} mode={mode} period={period} isMe={isMe} onClose={onClose} /> : null}
        </Sheet>
    );
}

function CardBody({
    entry,
    mode,
    period,
    isMe,
    onClose,
}: {
    entry: LeaderboardEntry;
    mode: 'overall' | 'classic' | 'mystery';
    period: LeaderboardPeriod;
    isMe: boolean;
    onClose: () => void;
}) {
    const sendChallenge = useGameStore((s) => s.sendChallenge);
    const [records, setRecords] = useState<PlayerRecords['records'] | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [mysteryOpen, setMysteryOpen] = useState(false);
    const [word, setWord] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let live = true;
        leaderboardApi
            .player(entry.userId, mode)
            .then((r) => live && setRecords(r.records))
            .catch(() => live && setLoadError(true));
        return () => {
            live = false;
        };
    }, [entry, mode]);

    async function challenge(kind: 'classic' | 'mystery') {
        if (sending) return;
        setSending(true);
        setError('');
        const r = await sendChallenge(entry.userId, entry.username, kind, kind === 'mystery' ? word : undefined);
        setSending(false);
        if (r.ok) onClose();
        else setError(r.error);
    }

    return (
                <View style={styles.body}>
                    <View style={styles.header}>
                        <Avatar avatarId={entry.avatarId} borderId={entry.profileBorderId} size={56} />
                        <View style={{ flex: 1, gap: 2 }}>
                            <RankBadge tier={entry.rankTier as RankTier} points={entry.rankPoints} size="sm" />
                            <Text style={styles.modeLabel} allowFontScaling={false}>
                                {MODE_LABEL[mode]} · standings
                            </Text>
                        </View>
                    </View>

                    <View style={styles.grid}>
                        {PERIODS.map((p) => {
                            const rec = records?.[p.key];
                            const active = p.key === period;
                            return (
                                <View key={p.key} style={[styles.cell, active ? styles.cellActive : null]}>
                                    <Text style={styles.cellLabel} allowFontScaling={false}>
                                        {p.label.toUpperCase()}
                                    </Text>
                                    {records ? (
                                        <>
                                            <Text style={styles.cellRank} allowFontScaling={false}>
                                                {rec ? `#${rec.rank.toLocaleString()}` : '—'}
                                            </Text>
                                            <Text style={styles.cellWl} allowFontScaling={false}>
                                                {rec ? `${rec.wins} W · ${rec.losses} L` : 'Not played'}
                                            </Text>
                                        </>
                                    ) : loadError ? (
                                        <Text style={styles.cellWl} allowFontScaling={false}>
                                            Unavailable
                                        </Text>
                                    ) : (
                                        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 6 }} />
                                    )}
                                </View>
                            );
                        })}
                    </View>

                    {isMe ? null : (
                        <View style={{ gap: spacing.sm }}>
                            {mysteryOpen ? (
                                <>
                                    <Text style={styles.hint} allowFontScaling={false}>
                                        Your word for {entry.username} to guess (4–10 letters). They pick one the same length.
                                    </Text>
                                    <TextInput
                                        value={word}
                                        onChangeText={(t) => setWord(t.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 10))}
                                        placeholder="YOUR WORD"
                                        placeholderTextColor={colors.textMuted}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        maxLength={10}
                                        style={styles.input}
                                        accessibilityLabel="Your Mystery word"
                                    />
                                </>
                            ) : null}
                            {error ? (
                                <Text style={styles.error} accessibilityRole="alert">
                                    {error}
                                </Text>
                            ) : null}
                            <View style={styles.actions}>
                                {mysteryOpen ? null : (
                                    <Pressable
                                        onPress={() => challenge('classic')}
                                        disabled={sending}
                                        accessibilityRole="button"
                                        style={({ pressed }) => [styles.btn, styles.primary, pressed ? styles.pressed : null]}
                                    >
                                        <Text style={styles.primaryText} allowFontScaling={false}>
                                            Challenge
                                        </Text>
                                    </Pressable>
                                )}
                                <Pressable
                                    onPress={() => (mysteryOpen ? challenge('mystery') : setMysteryOpen(true))}
                                    disabled={sending || (mysteryOpen && word.length < 4)}
                                    accessibilityRole="button"
                                    style={({ pressed }) => [
                                        styles.btn,
                                        mysteryOpen ? styles.primary : styles.secondary,
                                        mysteryOpen && word.length < 4 ? styles.disabled : null,
                                        pressed ? styles.pressed : null,
                                    ]}
                                >
                                    <Text style={mysteryOpen ? styles.primaryText : styles.secondaryText} allowFontScaling={false}>
                                        {mysteryOpen ? (sending ? 'Sending…' : 'Send Mystery duel') : 'Mystery duel'}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    )}
                </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    body: { gap: spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    modeLabel: { fontFamily: typography.familyMono, color: colors.textDim, fontSize: typography.sizes.xs },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    cell: {
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        minHeight: 78,
    },
    cellActive: { borderColor: colors.primary },
    cellLabel: { fontFamily: typography.familyMono, color: colors.textDim, fontSize: typography.sizes.xs, letterSpacing: 1 },
    cellRank: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.bold,
        marginTop: 2,
    },
    cellWl: { fontFamily: typography.family, color: colors.textMuted, fontSize: typography.sizes.xs },
    hint: { fontFamily: typography.family, color: colors.textDim, fontSize: typography.sizes.sm },
    input: {
        fontFamily: typography.familyMono,
        color: colors.text,
        fontSize: typography.sizes.lg,
        letterSpacing: 4,
        textAlign: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingVertical: spacing.sm,
        backgroundColor: colors.bg,
    },
    error: { fontFamily: typography.family, color: colors.danger, fontSize: typography.sizes.sm },
    actions: { flexDirection: 'row', gap: spacing.sm },
    btn: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md },
    primary: { backgroundColor: colors.primary },
    primaryText: {
        fontFamily: typography.familyDisplay,
        color: colors.bg,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    secondary: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.primaryDim },
    secondaryText: { fontFamily: typography.familyDisplay, color: colors.primary, fontSize: typography.sizes.md },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.85 },
}));
