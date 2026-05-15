// Daily challenge screen. One word per UTC day, same for every player.
// Async — no opponent, no timer beyond your own duration. Guess until
// solved or until you give up.
//
// UI:
//   - The current attempt (whatever guesses you've made so far)
//   - A keyboard to type
//   - When solved: see your stats + the leaderboard

import { useCallback, useEffect, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
    dailyApi,
    type DailyAttempt,
    type DailyChallengeMeta,
} from '../../src/api/resources';
import { Grid } from '../../src/components/game/Grid';
import { Keyboard, deriveLetterStates } from '../../src/components/game/Keyboard';
import { colors } from '../../src/theme/colors';
import { typography, radius, spacing } from '../../src/theme/typography';

type Cell = string | null;

export default function DailyChallengeScreen() {
    const router = useRouter();
    const [meta, setMeta] = useState<DailyChallengeMeta | null>(null);
    const [attempt, setAttempt] = useState<DailyAttempt | null>(null);
    const [board, setBoard] = useState<Cell[]>([]);
    const [cursor, setCursor] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const [leaderboard, setLeaderboard] = useState<
        { userId: string; username: string; guessCount: number; durationMs: number }[]
    >([]);

    const load = useCallback(async () => {
        try {
            const r = await dailyApi.today();
            setMeta(r.challenge);
            setAttempt(r.attempt);
            // Initialize empty input row of the right length.
            setBoard(new Array(r.challenge.wordLength).fill(null));
            setCursor(0);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('daily today failed', err);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    useEffect(() => {
        if (attempt?.solved) {
            // Fetch leaderboard once on solve.
            dailyApi
                .leaderboard()
                .then((r) => setLeaderboard(r.entries))
                .catch(() => {});
        }
    }, [attempt?.solved]);

    function appendLetter(letter: string) {
        if (!meta || attempt?.solved) return;
        if (cursor >= meta.wordLength) return;
        const next = [...board];
        next[cursor] = letter;
        setBoard(next);
        // Advance to next null cell.
        let nextCursor = cursor + 1;
        while (nextCursor < meta.wordLength && next[nextCursor] !== null) {
            nextCursor += 1;
        }
        setCursor(nextCursor);
    }

    function backspace() {
        if (!meta) return;
        let pos = cursor;
        if (pos >= meta.wordLength) pos = meta.wordLength - 1;
        const next = [...board];
        if (next[pos] !== null) {
            next[pos] = null;
            setBoard(next);
            setCursor(pos);
        } else if (pos > 0) {
            next[pos - 1] = null;
            setBoard(next);
            setCursor(pos - 1);
        }
    }

    async function submitGuess() {
        if (!meta || attempt?.solved) return;
        if (board.some((c) => c === null)) {
            setLastError(`Need ${meta.wordLength} letters`);
            return;
        }
        const guess = board.join('');
        setSubmitting(true);
        setLastError(null);
        try {
            const r = await dailyApi.guess(guess);
            if (!r.ok) {
                setLastError(r.error ?? 'Rejected');
                return;
            }
            // Append the guess locally so the grid shows it immediately.
            setAttempt((prev) => ({
                guesses: [
                    ...(prev?.guesses ?? []),
                    { guess, tiles: r.tiles },
                ],
                solved: r.solved,
                guessCount: r.guessCount,
                durationMs: prev?.durationMs ?? 0,
                startedAt: prev?.startedAt ?? Date.now(),
            }));
            // Reset input row.
            setBoard(new Array(meta.wordLength).fill(null));
            setCursor(0);
        } catch (err) {
            setLastError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setSubmitting(false);
        }
    }

    if (!meta) {
        return (
            <SafeAreaView style={styles.safe}>
                <Text style={styles.loading} allowFontScaling={false}>
                    Loading today&apos;s puzzle…
                </Text>
            </SafeAreaView>
        );
    }

    const guesses = attempt?.guesses ?? [];
    const letterStates = deriveLetterStates(
        guesses.map((g) => ({ guess: g.guess, tiles: g.tiles }))
    );

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Pressable
                        onPress={() => router.back()}
                        hitSlop={12}
                        style={styles.backBtn}
                    >
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </Pressable>
                    <View>
                        <Text style={styles.title} allowFontScaling={false}>
                            Daily Challenge
                        </Text>
                        <Text style={styles.subtitle} allowFontScaling={false}>
                            {meta.wordLength}-letter word · resets midnight UTC
                        </Text>
                    </View>
                </View>

                <Grid
                    wordLength={meta.wordLength}
                    guesses={guesses.map((g) => ({
                        guess: g.guess,
                        tiles: g.tiles,
                    }))}
                    inputCells={board}
                    inputCursor={cursor}
                    onTilePress={(pos) => setCursor(pos)}
                    maxRows={Math.max(6, guesses.length + 1)}
                />

                {lastError ? (
                    <Text style={styles.error} allowFontScaling={false}>
                        {lastError}
                    </Text>
                ) : null}

                {attempt?.solved ? (
                    <View style={styles.solvedCard}>
                        <Ionicons
                            name="checkmark-circle"
                            size={28}
                            color={colors.primary}
                        />
                        <Text style={styles.solvedTitle} allowFontScaling={false}>
                            Solved!
                        </Text>
                        <Text style={styles.solvedStats} allowFontScaling={false}>
                            {attempt.guessCount} guess
                            {attempt.guessCount === 1 ? '' : 'es'} ·{' '}
                            {Math.round((attempt.durationMs ?? 0) / 1000)}s
                        </Text>

                        {leaderboard.length > 0 ? (
                            <View style={styles.lbWrap}>
                                <Text
                                    style={styles.lbHeader}
                                    allowFontScaling={false}
                                >
                                    Today&apos;s top solvers
                                </Text>
                                {leaderboard.slice(0, 10).map((e, idx) => (
                                    <View key={e.userId} style={styles.lbRow}>
                                        <Text
                                            style={styles.lbRank}
                                            allowFontScaling={false}
                                        >
                                            {idx + 1}
                                        </Text>
                                        <Text
                                            style={styles.lbName}
                                            allowFontScaling={false}
                                            numberOfLines={1}
                                        >
                                            {e.username}
                                        </Text>
                                        <Text
                                            style={styles.lbScore}
                                            allowFontScaling={false}
                                        >
                                            {e.guessCount}g · {Math.round(e.durationMs / 1000)}s
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </View>
                ) : null}
            </ScrollView>

            {!attempt?.solved ? (
                <View style={styles.keyboardWrap}>
                    <Keyboard
                        onLetter={appendLetter}
                        onBackspace={backspace}
                        onEnter={submitGuess}
                        letterStates={letterStates}
                        disabled={submitting}
                    />
                </View>
            ) : null}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    backBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: colors.text,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.black,
    },
    subtitle: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
    },
    loading: {
        color: colors.textDim,
        textAlign: 'center',
        marginTop: spacing.xl,
    },
    error: {
        color: colors.danger,
        textAlign: 'center',
        marginTop: spacing.sm,
    },
    keyboardWrap: {
        padding: spacing.sm,
    },
    solvedCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.lg,
        marginTop: spacing.lg,
        alignItems: 'center',
        gap: spacing.xs,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    solvedTitle: {
        color: colors.primary,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.black,
    },
    solvedStats: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
    },
    lbWrap: {
        width: '100%',
        marginTop: spacing.md,
        gap: spacing.xs,
    },
    lbHeader: {
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.xs,
    },
    lbRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    lbRank: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
        minWidth: 18,
    },
    lbName: {
        flex: 1,
        color: colors.text,
        fontSize: typography.sizes.sm,
    },
    lbScore: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
    },
});
