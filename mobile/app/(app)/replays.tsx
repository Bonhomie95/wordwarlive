import { useCallback, useState } from 'react';
import {
    FlatList,
    Modal,
    ScrollView,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Grid } from '../../src/components/game/Grid';
import { Button } from '../../src/components/ui/Button';
import { Screen } from '../../src/components/ui/Screen';
import { replaysApi, type ReplayMeta } from '../../src/api/resources';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, radius, spacing } from '../../src/theme/typography';

export default function ReplaysScreen() {
    const router = useRouter();
    const [replays, setReplays] = useState<ReplayMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<ReplayMeta | null>(null);


    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await replaysApi.list();
            setReplays(r.replays);
            setError('');
        } catch {
            setError('Could not load your replays. Pull down or retry.');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    return (
        <Screen edges={['top']}>
            <View style={styles.header}>
                <Pressable
                    onPress={() => router.back()}
                    hitSlop={12}
                    style={styles.backBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.title} allowFontScaling={false}>
                    Replays
                </Text>
            </View>

            {!!error && <View style={{ padding: spacing.md, gap: spacing.sm }}>
                <Text style={{ color: colors.danger }}>{error}</Text>
                <Button label="Retry" onPress={load} />
            </View>}
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
                    refreshing={loading}
                    onRefresh={load}
                    renderItem={({ item }) => <ReplayRow replay={item} onPress={() => setSelected(item)} />}
                />
            )}
            {selected && <ReplayDetail key={selected.matchId} replay={selected} onClose={() => setSelected(null)} />}
        </Screen>
    );
}

const ReplayRow: React.FC<{ replay: ReplayMeta; onPress: () => void }> = ({ replay, onPress }) => {
    const color = replay.tied ? colors.textDim : replay.youWon ? colors.primary : colors.danger;
    const label = replay.tied ? 'DRAW' : replay.youWon ? 'WIN' : 'LOSS';
    return (
        <Pressable style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`View replay versus ${replay.opponentUsername}, ${label}`}>
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
        </Pressable>
    );
};

type ReplayData = Awaited<ReturnType<typeof replaysApi.get>>;

function ReplayDetail({ replay, onClose }: { replay: ReplayMeta; onClose: () => void }) {
    const [data, setData] = useState<ReplayData | null>(null);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setError('');
        try { setData(await replaysApi.get(replay.matchId)); }
        catch { setError('Could not load this replay. Please retry.'); }
    }, [replay.matchId]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));
    return <Modal visible onRequestClose={onClose} presentationStyle="pageSheet">
        <Screen edges={['top', 'bottom']}>
            <View style={[styles.header, { justifyContent: 'space-between' }]}>
                <Text style={styles.opponent}>Match replay</Text>
                <Button variant="ghost" label="Close" onPress={onClose} />
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
                <Text style={styles.opponent}>vs {replay.opponentUsername}</Text>
                <Text style={styles.metaText}>Your answer: {replay.word} · {Math.round(replay.durationMs / 1000)}s</Text>
                {replay.mode === 'mystery' && <Text style={styles.metaText}>Each player solved a different word.</Text>}
                {!!error && <><Text style={{ color: colors.danger }}>{error}</Text><Button label="Retry" onPress={load} /></>}
                {!data && !error && <Text style={styles.metaText}>Loading replay…</Text>}
                {data && [['You', data.yourGuesses], [replay.opponentUsername, data.opponentGuesses]].map(([name, rows]) => {
                    const guesses = rows as ReplayData['yourGuesses'];
                    return <View key={name as string} style={{ gap: spacing.sm }}>
                        <Text style={styles.opponent}>{name as string}</Text>
                        {guesses.length ? <Grid wordLength={replay.wordLength} guesses={guesses} inputCells={[]} inputCursor={0} maxRows={guesses.length} /> : <Text style={styles.metaText}>No guesses submitted.</Text>}
                    </View>;
                })}
            </ScrollView>
        </Screen>
    </Modal>;
}

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
        fontFamily: typography.familyDisplay,
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
        fontFamily: typography.family,
        fontSize: typography.sizes.sm,
        textAlign: 'center',
        maxWidth: 260,
        lineHeight: 20,
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
        fontFamily: typography.familyMonoBold,
        fontSize: 10,
        fontWeight: typography.weights.black,
        letterSpacing: 1,
    },
    opponent: {
        color: colors.text,
        fontFamily: typography.familyDisplay,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    metaText: {
        color: colors.textDim,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.xs,
        marginTop: 2,
    },
    word: {
        color: colors.textMuted,
        fontFamily: typography.familyMonoBold,
        fontSize: typography.sizes.sm,
        letterSpacing: 1,
    },
}));
