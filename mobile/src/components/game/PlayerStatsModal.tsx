// Player stats modal. Triggered by tapping a player's name/avatar in the
// match header. Shows their rank, record, equipped cosmetics — gives the
// player a feel for who they're up against.
//
// Self-contained: takes a PublicUser and renders a Modal. The match screen
// owns the open/close state.

import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';
import { RankBadge } from '../ui/RankBadge';
import { reportsApi } from '../../api/resources';
import type { PublicUser, RankTier } from '../../types/index';

interface Props {
    player: PublicUser | null;
    /** Label for the modal title — "Your Stats" vs "Opponent" etc. */
    title: string;
    /** Show a "Report player" action (only for opponents, not yourself). */
    reportable?: boolean;
    onClose: () => void;
}

function reportPlayer(player: PublicUser) {
    Alert.alert(
        `Report ${player.username}?`,
        'Report this player for an offensive username or bad behavior. Our team will review it.',
        [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Offensive name',
                onPress: () =>
                    submitReport(player, 'offensive_name'),
            },
            {
                text: 'Harassment',
                style: 'destructive',
                onPress: () => submitReport(player, 'harassment'),
            },
        ]
    );
}

async function submitReport(
    player: PublicUser,
    reason: 'offensive_name' | 'harassment'
) {
    try {
        await reportsApi.submit({
            targetType: 'user',
            targetId: player.id,
            reason,
        });
        Alert.alert('Thanks', 'Your report has been submitted.');
    } catch {
        Alert.alert('Could not submit', 'Please try again later.');
    }
}

export const PlayerStatsModal: React.FC<Props> = ({
    player,
    title,
    reportable,
    onClose,
}) => {
    return (
        <Modal
            visible={!!player}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            {player ? (
                <Pressable style={styles.backdrop} onPress={onClose}>
                    {/* The inner Pressable swallows taps so tapping the card
                        body doesn't dismiss. */}
                    <Pressable style={styles.card} onPress={() => {}}>
                        <View style={styles.headerRow}>
                            <Text style={styles.title} allowFontScaling={false}>
                                {title}
                            </Text>
                            <Pressable onPress={onClose} hitSlop={12}>
                                <Ionicons name="close" size={20} color={colors.textDim} />
                            </Pressable>
                        </View>

                        <View style={styles.avatarRow}>
                            <View style={styles.avatar}>
                                <Ionicons name="person" size={42} color={colors.textDim} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.username} allowFontScaling={false}>
                                    {player.username}
                                </Text>
                                <View style={styles.rankRow}>
                                    <RankBadge tier={player.rankTier as RankTier} size="sm" />
                                    <Text style={styles.rankPoints} allowFontScaling={false}>
                                        {player.rankPoints} RP
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.statsGrid}>
                            <StatCell label="WINS" value={String(player.wins)} />
                            <StatCell label="LOSSES" value={String(player.losses)} />
                            <StatCell
                                label="WIN %"
                                value={`${winRate(player.wins, player.losses)}%`}
                            />
                        </View>

                        {reportable ? (
                            <Pressable
                                onPress={() => reportPlayer(player)}
                                accessibilityRole="button"
                                accessibilityLabel={`Report ${player.username}`}
                                style={({ pressed }) => [
                                    styles.reportBtn,
                                    pressed ? { opacity: 0.7 } : null,
                                ]}
                                hitSlop={6}
                            >
                                <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
                                <Text style={styles.reportText} allowFontScaling={false}>
                                    Report player
                                </Text>
                            </Pressable>
                        ) : null}
                    </Pressable>
                </Pressable>
            ) : null}
        </Modal>
    );
};

const StatCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.statCell}>
        <Text style={styles.statValue} allowFontScaling={false}>
            {value}
        </Text>
        <Text style={styles.statLabel} allowFontScaling={false}>
            {label}
        </Text>
    </View>
);

function winRate(wins: number, losses: number): number {
    const total = wins + losses;
    if (total === 0) return 0;
    return Math.round((wins / total) * 100);
}

const styles = makeThemedStyles(() => StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.md,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    avatarRow: {
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'center',
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    username: {
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
    },
    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: 4,
    },
    rankPoints: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    statCell: {
        flex: 1,
        padding: spacing.sm,
        backgroundColor: colors.bg,
        borderRadius: radius.sm,
        alignItems: 'center',
    },
    statValue: {
        color: colors.text,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.bold,
    },
    statLabel: {
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
        marginTop: 2,
        letterSpacing: 0.5,
    },
    reportBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: spacing.xs,
    },
    reportText: {
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.medium,
    },
}));
