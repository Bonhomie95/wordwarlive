// Leaderboard screen.
//
// Layout:
//   - Period selector at top: Daily / Weekly / Monthly / All-time.
//   - Top-3 podium with gold/silver/bronze medal icons next to usernames.
//   - Vertical list for ranks 4+.
//   - If the requesting player isn't in the visible top-N but DOES have a
//     rank in the bucket, a sticky "Your rank" pill appears at the bottom.
//
// Refreshes whenever the screen is focused so the player sees their result
// reflected immediately after a match.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { leaderboardApi } from '../../src/api/resources';
import { useAuthStore } from '../../src/store/authStore';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { Avatar } from '../../src/components/ui/Avatar';
import { Podium } from '../../src/components/ui/Podium';
import type {
    LeaderboardEntry,
    LeaderboardPeriod,
    LeaderboardResponse,
} from '../../src/types/index';
import { makeThemedStyles, colors, type RankTier } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';
import { contentColumn } from '../../src/theme/layout';

const PERIODS: readonly { key: LeaderboardPeriod; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'all_time', label: 'All-time' },
];

type Mode = 'overall' | 'classic' | 'mystery';
const MODES: readonly { key: Mode; label: string }[] = [
    { key: 'overall', label: 'All' },
    { key: 'classic', label: 'Classic' },
    { key: 'mystery', label: 'Mystery' },
];

export default function LeaderboardScreen() {
    const me = useAuthStore((s) => s.user);
    const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
    const [mode, setMode] = useState<Mode>('overall');
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    // Rows centred on me, shown instead of the top list after "Show my position"
    // when I rank below what the top list covers.
    const [around, setAround] = useState<LeaderboardResponse | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(
        async (p: LeaderboardPeriod, m: Mode) => {
            setLoading(true);
            setAround(null);
            try {
                const r = await leaderboardApi.fetch(p, m, 50);
                setData(r);
            } catch (err) {
                // Soft-fail; the empty state below renders.
                 
                console.warn('leaderboard fetch failed', err);
                setData(null);
            } finally {
                setLoading(false);
            }
        },
        []
    );

    useFocusEffect(
        useCallback(() => {
            load(period, mode);
        }, [load, period, mode])
    );

    function onPeriodChange(p: LeaderboardPeriod) {
        if (p === period) return;
        setPeriod(p);
        load(p, mode);
    }

    function onModeChange(m: Mode) {
        if (m === mode) return;
        setMode(m);
        load(period, m);
    }

    // Show top 100 by default. If "you" rank is beyond 100, the goto-me
    // pill scrolls to your row regardless.
    const top3 = around ? [] : data?.entries.slice(0, 3) ?? [];
    const rest = around ? around.entries : (data?.entries ?? []).slice(3, 100);
    const youInTop = data?.you
        ? data.entries.some((e) => e.userId === data.you?.userId)
        : false;
    // Keep the pill up whenever you're not on the podium so your rank is
    // always one glance away; tapping scrolls to your row when it's listed.
    const showYouPill = !!data?.you && (!youInTop || data.you.rankInLeaderboard > 3);
    const listRef = useRef<FlatList<typeof rest[number]>>(null);
    const [locating, setLocating] = useState(false);

    // Once the around-me window renders, centre my row.
    useEffect(() => {
        if (!around || !me) return;
        const idx = around.entries.findIndex((e) => e.userId === me.id);
        if (idx < 0) return;
        const t = setTimeout(
            () => listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5, animated: false }),
            50
        );
        return () => clearTimeout(t);
    }, [around, me]);

    async function scrollToMe() {
        if (!data?.you) return;
        const idx = rest.findIndex((e) => e.userId === data.you?.userId);
        if (idx >= 0) {
            listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5, animated: true });
            return;
        }
        // Not on this screen (rank below the top list): fetch the rows around me.
        setLocating(true);
        try {
            const r = await leaderboardApi.fetch(period, mode, 21, true);
            setAround(r);
        } catch (err) {
            console.warn('leaderboard around-me fetch failed', err);
        } finally {
            setLocating(false);
        }
    }

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Text style={styles.title} allowFontScaling={false}>
                    Leaderboard
                </Text>
                <Text style={styles.subtitle} allowFontScaling={false}>
                    Ranked by wins. Ties broken by skill rating.
                </Text>
            </View>

            <View style={styles.periodRow}>
                {PERIODS.map((p) => (
                    <Pressable
                        key={p.key}
                        onPress={() => onPeriodChange(p.key)}
                        accessibilityRole="tab"
                        accessibilityLabel={p.label}
                        accessibilityState={{ selected: p.key === period }}
                        style={({ pressed }) => [
                            styles.periodTab,
                            p.key === period ? styles.periodTabActive : null,
                            pressed ? { opacity: 0.85 } : null,
                        ]}
                    >
                        <Text
                            style={[
                                styles.periodLabel,
                                p.key === period ? styles.periodLabelActive : null,
                            ]}
                            allowFontScaling={false}
                        >
                            {p.label}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {/* Mode picker — segmented control under period tabs. Classic and
                Mystery are mode-specific; "All" combines them. */}
            <View style={styles.modeRow}>
                {MODES.map((m) => (
                    <Pressable
                        key={m.key}
                        onPress={() => onModeChange(m.key)}
                        accessibilityRole="tab"
                        accessibilityLabel={`${m.label} mode`}
                        accessibilityState={{ selected: m.key === mode }}
                        style={({ pressed }) => [
                            styles.modeTab,
                            m.key === mode ? styles.modeTabActive : null,
                            pressed ? { opacity: 0.85 } : null,
                        ]}
                    >
                        <Text
                            style={[
                                styles.modeLabel,
                                m.key === mode ? styles.modeLabelActive : null,
                            ]}
                            allowFontScaling={false}
                        >
                            {m.label}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {loading && data ? (
                <View style={styles.reloadingBar}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.reloadingText} allowFontScaling={false}>
                        Updating…
                    </Text>
                </View>
            ) : null}

            {loading && !data ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : data && data.entries.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <Ionicons name="trophy-outline" size={48} color={colors.textMuted} />
                    <Text style={styles.emptyTitle} allowFontScaling={false}>
                        No matches yet
                    </Text>
                    <Text style={styles.emptyDesc} allowFontScaling={false}>
                        {period === 'daily'
                            ? 'Be the first to play today.'
                            : period === 'weekly'
                            ? 'No one\'s played this week. Yet.'
                            : period === 'monthly'
                            ? 'A clean slate. Make your mark.'
                            : 'Play a match to claim your spot.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    ref={listRef}
                    data={rest}
                    keyExtractor={(e) => e.userId}
                    contentContainerStyle={styles.listContent}
                    onScrollToIndexFailed={(info) => {
                        // Happens when the index isn't yet rendered. Wait,
                        // then retry. Soft fallback so a tap never freezes.
                        setTimeout(() => {
                            listRef.current?.scrollToOffset({
                                offset: info.averageItemLength * info.index,
                                animated: true,
                            });
                        }, 100);
                    }}
                    ListHeaderComponent={
                        around ? (
                            <Pressable
                                onPress={() => setAround(null)}
                                accessibilityRole="button"
                                accessibilityLabel="Back to top of leaderboard"
                                style={({ pressed }) => [styles.backToTop, pressed ? { opacity: 0.85 } : null]}
                            >
                                <Ionicons name="arrow-up" size={16} color={colors.primary} />
                                <Text style={styles.backToTopText} allowFontScaling={false}>
                                    Back to top
                                </Text>
                            </Pressable>
                        ) : top3.length > 0 ? (
                            <Podium
                                top3={top3.map((e) => ({ userId: e.userId, username: e.username, score: `${e.wins} W` }))}
                                meId={me?.id ?? null}
                            />
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <Row entry={item} highlightId={me?.id ?? null} />
                    )}
                />
            )}

            {showYouPill && data?.you && !around ? (
                <View style={styles.youPillWrap} pointerEvents="box-none">
                    <Pressable
                        onPress={scrollToMe}
                        disabled={locating}
                        accessibilityRole="button"
                        accessibilityLabel={`Your rank ${data.you.rankInLeaderboard}, tap to find`}
                        style={({ pressed }) => [
                            styles.youPill,
                            pressed ? { opacity: 0.85 } : null,
                        ]}
                    >
                        <Text style={styles.youPillRank} allowFontScaling={false}>
                            #{data.you.rankInLeaderboard}
                        </Text>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.youPillName} allowFontScaling={false}>
                                {locating ? 'Finding you…' : 'You · show my position'}
                            </Text>
                            <Text style={styles.youPillStats} allowFontScaling={false}>
                                {data.you.wins} W · {data.you.losses} L
                            </Text>
                        </View>
                        <RankBadge tier={data.you.rankTier as RankTier} size="sm" />
                    </Pressable>
                </View>
            ) : null}
        </SafeAreaView>
    );
}

// ─── List row ──────────────────────────────────────────────────────────────

function Row({
    entry,
    highlightId,
}: {
    entry: LeaderboardEntry;
    highlightId: string | null;
}) {
    const isMe = entry.userId === highlightId;
    return (
        <View style={[styles.row, isMe ? styles.rowMe : null]}>
            <Text style={styles.rowRank} allowFontScaling={false}>
                #{entry.rankInLeaderboard}
            </Text>
            <Avatar avatarId={entry.avatarId} borderId={entry.profileBorderId} size={40} />
            <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1} allowFontScaling={false}>
                    {entry.username}
                    {isMe ? '  (ME)' : ''}
                </Text>
                <Text style={styles.rowStats} allowFontScaling={false}>
                    {entry.wins} W · {entry.losses} L
                </Text>
            </View>
            <RankBadge tier={entry.rankTier as RankTier} size="sm" />
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { ...contentColumn, backgroundColor: colors.bg },
    header: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    title: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
    },
    subtitle: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        marginTop: spacing.xs,
    },
    periodRow: {
        flexDirection: 'row',
        gap: 4,
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
    },
    periodTab: {
        flex: 1,
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    periodTabActive: {
        backgroundColor: colors.surfaceElevated,
        borderColor: colors.primary,
    },
    modeRow: {
        flexDirection: 'row',
        gap: 4,
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.sm,
    },
    modeTab: {
        flex: 1,
        paddingVertical: 6,
        borderRadius: radius.sm,
        alignItems: 'center',
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    modeTabActive: {
        backgroundColor: colors.surface,
        borderColor: colors.warning,
    },
    modeLabel: {
        fontFamily: typography.familyDisplay,
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
    },
    modeLabelActive: {
        color: colors.warning,
    },
    periodLabel: {
        fontFamily: typography.familyDisplay,
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
    },
    periodLabelActive: {
        color: colors.primary,
    },
    loadingWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
    },
    emptyDesc: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        textAlign: 'center',
    },
    listContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 80,
    },

    // ─── List rows ─────────────────────────────────────────────────────────
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.xs,
    },
    rowMe: {
        borderColor: colors.primary,
        backgroundColor: colors.surfaceElevated,
    },
    rowRank: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontFamily: typography.familyMono,
        fontWeight: typography.weights.bold,
        minWidth: 36,
    },
    rowAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowInitial: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
    },
    rowName: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
    },
    rowStats: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.xs,
    },

    // ─── Sticky "you" pill ─────────────────────────────────────────────────
    youPillWrap: {
        position: 'absolute',
        bottom: 12,
        left: spacing.lg,
        right: spacing.lg,
    },
    youPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
    },
    youPillRank: {
        color: '#0F1115',
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.black,
        fontFamily: typography.familyMono,
        minWidth: 50,
    },
    youPillName: {
        fontFamily: typography.familyDisplay,
        color: '#0F1115',
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    youPillStats: {
        fontFamily: typography.family,
        color: '#0F1115',
        opacity: 0.7,
        fontSize: typography.sizes.xs,
    },
    reloadingBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 6,
    },
    reloadingText: {
        fontFamily: typography.family,
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
    },
    backToTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        marginBottom: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    backToTopText: {
        fontFamily: typography.family,
        color: colors.primary,
        fontSize: typography.sizes.sm,
    },
}));
