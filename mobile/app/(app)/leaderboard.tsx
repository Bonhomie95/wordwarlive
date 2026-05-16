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

import { useCallback, useRef, useState } from 'react';
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
import type {
    LeaderboardEntry,
    LeaderboardPeriod,
    LeaderboardResponse,
} from '../../src/types/index';
import { makeThemedStyles, colors, type RankTier } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

const PERIODS: ReadonlyArray<{ key: LeaderboardPeriod; label: string }> = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'all_time', label: 'All-time' },
];

type Mode = 'overall' | 'classic' | 'mystery';
const MODES: ReadonlyArray<{ key: Mode; label: string }> = [
    { key: 'overall', label: 'All' },
    { key: 'classic', label: 'Classic' },
    { key: 'mystery', label: 'Mystery' },
];

export default function LeaderboardScreen() {
    const me = useAuthStore((s) => s.user);
    const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
    const [mode, setMode] = useState<Mode>('overall');
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(
        async (p: LeaderboardPeriod, m: Mode) => {
            setLoading(true);
            try {
                const r = await leaderboardApi.fetch(p, m, 50);
                setData(r);
            } catch (err) {
                // Soft-fail; the empty state below renders.
                // eslint-disable-next-line no-console
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
    const top3 = data?.entries.slice(0, 3) ?? [];
    const rest = (data?.entries ?? []).slice(3, 100);
    const youInTop = data?.you
        ? data.entries.some((e) => e.userId === data.you?.userId)
        : false;
    const showYouPill = !!data?.you && !youInTop;
    const listRef = useRef<FlatList<typeof rest[number]>>(null);

    function scrollToMe() {
        if (!data?.you) return;
        const idx = rest.findIndex((e) => e.userId === data.you?.userId);
        if (idx < 0) {
            // I'm not on this screen at all (rank > 100). Soft-fail; the
            // pill will keep showing, and the user knows their rank from it.
            return;
        }
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5, animated: true });
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
                        top3.length > 0 ? (
                            <Podium
                                top3={top3}
                                meId={me?.id ?? null}
                            />
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <Row entry={item} highlightId={me?.id ?? null} />
                    )}
                />
            )}

            {showYouPill && data?.you ? (
                <View style={styles.youPillWrap} pointerEvents="box-none">
                    <Pressable
                        onPress={scrollToMe}
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
                                You (tap to find)
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

// ─── Podium ────────────────────────────────────────────────────────────────

function Podium({
    top3,
    meId,
}: {
    top3: LeaderboardEntry[];
    meId: string | null;
}) {
    // Render order: 2nd | 1st | 3rd, classic podium layout.
    const first = top3[0] ?? null;
    const second = top3[1] ?? null;
    const third = top3[2] ?? null;

    return (
        <View style={styles.podiumWrap}>
            <View style={styles.podiumRow}>
                {second ? (
                    <PodiumColumn
                        entry={second}
                        place={2}
                        height={100}
                        isMe={second.userId === meId}
                    />
                ) : (
                    <View style={{ flex: 1 }} />
                )}
                {first ? (
                    <PodiumColumn
                        entry={first}
                        place={1}
                        height={130}
                        isMe={first.userId === meId}
                    />
                ) : (
                    <View style={{ flex: 1 }} />
                )}
                {third ? (
                    <PodiumColumn
                        entry={third}
                        place={3}
                        height={80}
                        isMe={third.userId === meId}
                    />
                ) : (
                    <View style={{ flex: 1 }} />
                )}
            </View>
        </View>
    );
}

const MEDAL_COLOR = {
    1: '#F4B940', // gold
    2: '#C0C0C0', // silver
    3: '#CD7F32', // bronze
} as const;

function MedalIcon({ place, size = 18 }: { place: 1 | 2 | 3; size?: number }) {
    return (
        <Ionicons name="medal" size={size} color={MEDAL_COLOR[place]} />
    );
}

function PodiumColumn({
    entry,
    place,
    height,
    isMe,
}: {
    entry: LeaderboardEntry;
    place: 1 | 2 | 3;
    height: number;
    isMe: boolean;
}) {
    return (
        <View style={styles.podiumCol}>
            <View style={[styles.podiumAvatar, isMe ? styles.podiumAvatarMe : null]}>
                <Text style={styles.podiumInitial} allowFontScaling={false}>
                    {entry.username.slice(0, 1).toUpperCase()}
                </Text>
            </View>
            <View style={styles.podiumNameRow}>
                <MedalIcon place={place} size={14} />
                <Text
                    style={styles.podiumName}
                    numberOfLines={1}
                    allowFontScaling={false}
                >
                    {entry.username}
                </Text>
            </View>
            <View
                style={[
                    styles.podiumPlinth,
                    { height, backgroundColor: plinthColor(place) },
                ]}
            >
                <Text style={styles.podiumPlace} allowFontScaling={false}>
                    {place}
                </Text>
                <Text style={styles.podiumWins} allowFontScaling={false}>
                    {entry.wins} W
                </Text>
            </View>
        </View>
    );
}

function plinthColor(place: 1 | 2 | 3): string {
    switch (place) {
        case 1: return 'rgba(244, 185, 64, 0.25)';
        case 2: return 'rgba(192, 192, 192, 0.20)';
        case 3: return 'rgba(205, 127, 50, 0.20)';
    }
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
            <View style={styles.rowAvatar}>
                <Text style={styles.rowInitial} allowFontScaling={false}>
                    {entry.username.slice(0, 1).toUpperCase()}
                </Text>
            </View>
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
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    title: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
    },
    subtitle: {
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
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
    },
    modeLabelActive: {
        color: colors.warning,
    },
    periodLabel: {
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
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
    },
    emptyDesc: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        textAlign: 'center',
    },
    listContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 80,
    },

    // ─── Podium ────────────────────────────────────────────────────────────
    podiumWrap: {
        marginBottom: spacing.lg,
    },
    podiumRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm,
    },
    podiumCol: {
        flex: 1,
        alignItems: 'center',
        gap: spacing.xs,
    },
    podiumAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    podiumAvatarMe: {
        borderColor: colors.primary,
    },
    podiumInitial: {
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
    },
    podiumNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        maxWidth: '100%',
    },
    podiumName: {
        color: colors.text,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        maxWidth: 80,
    },
    podiumPlinth: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderTopLeftRadius: radius.md,
        borderTopRightRadius: radius.md,
        gap: 2,
    },
    podiumPlace: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
        fontFamily: typography.familyMono,
    },
    podiumWins: {
        color: colors.textDim,
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: typography.weights.bold,
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
        color: colors.text,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
    },
    rowName: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
    },
    rowStats: {
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
        color: '#0F1115',
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    youPillStats: {
        color: '#0F1115',
        opacity: 0.7,
        fontSize: typography.sizes.xs,
    },
}));
