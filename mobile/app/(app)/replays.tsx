// Replays list. Shows recent matches you played with outcome + opponent +
// duration. Tapping a row could later open a full board-fill replay view
// (deferred — backend supports it via /api/replays/:matchId).

import { useCallback, useState } from 'react';
import {
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { replaysApi, type ReplayMeta } from '../../src/api/resources';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, radius, spacing } from '../../src/theme/typography';

export default function ReplaysScreen() {
    const router = useRouter();
    const [replays, setReplays] = useState<ReplayMeta[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await replaysApi.list();
            setReplays(r.replays);
        } catch {
            // soft fail
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Pressable
                    onPress={() => router.back()}
                    hitSlop={12}
                    style={styles.backBtn}
                >
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.title} allowFontScaling={false}>
                    Replays
                </Text>
            </View>

            {loading && replays.length === 0 ? (
                <Text style={styles.loading} allowFontScaling={false}>
                    Loading…
                </Text>
            ) : replays.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <Ionicons
                        name="film-outline"
                        size={48}
                        color={colors.textMuted}
                    />
                    <Text style={styles.empty} allowFontScaling={false}>
                        No matches yet. Play a few games to start
                        building your replay reel.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={replays}
                    keyExtractor={(r) => r.matchId}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => <ReplayRow replay={item} />}
                />
            )}
        </SafeAreaView>
    );
}

const ReplayRow: React.FC<{ replay: ReplayMeta }> = ({ replay }) => {
    const color = replay.youWon ? colors.primary : colors.danger;
    const label = replay.youWon ? 'WIN' : 'LOSS';
    return (
        <View style={styles.row}>
            <View style={[styles.outcomeBadge, { borderColor: color }]}>
                <Text style={[styles.outcomeLabel, { color }]} allowFontScaling={false}>
                    {label}
                </Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.opponent} allowFontScaling={false}>
                    vs {replay.opponentUsername}
                </Text>
                <Text style={styles.metaText} allowFontScaling={false}>
                    {replay.mode === 'mystery' ? '🎭 Mystery · ' : ''}
                    {replay.wordLength}-letter · {Math.round(replay.durationMs / 1000)}s
                </Text>
            </View>
            <Text style={styles.word} allowFontScaling={false}>
                {replay.word}
            </Text>
        </View>
    );
};

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    backBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
    },
    loading: {
        color: colors.textDim,
        textAlign: 'center',
        marginTop: spacing.xl,
    },
    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        gap: spacing.md,
    },
    empty: {
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        textAlign: 'center',
        maxWidth: 260,
    },
    list: { padding: spacing.md, gap: spacing.xs },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.xs,
    },
    outcomeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1.5,
    },
    outcomeLabel: {
        fontSize: 10,
        fontWeight: typography.weights.black,
        letterSpacing: 1,
    },
    opponent: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
    },
    metaText: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        marginTop: 2,
    },
    word: {
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
        letterSpacing: 1,
    },
}));
