// Post-game screen. Shows the outcome, rank/XP changes, the answer, and
// both players' guess histories side-by-side so the player can analyze how
// the match played out.

import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { Tile } from '../../src/components/game/Tile';
import { useGameStore } from '../../src/store/gameStore';
import { useAuthStore } from '../../src/store/authStore';
import { showInterstitial } from '../../src/ads';
import type { MatchOver } from '../../src/types/index';
import { colors, type RankTier } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

const RESULT_TITLE = {
    win: 'Victory',
    loss: 'Defeat',
    tie: 'Draw',
} as const;

const RESULT_COLOR = {
    win: colors.primary,
    loss: colors.danger,
    tie: colors.textDim,
};

export default function PostGame() {
    const router = useRouter();
    const matchOver = useGameStore((s) => s.matchOver);
    const reset = useGameStore((s) => s.reset);
    const shouldShowInterstitial = useGameStore((s) => s.shouldShowInterstitial);
    const markInterstitialShown = useGameStore((s) => s.markInterstitialShown);
    const refreshMe = useAuthStore((s) => s.refreshMe);
    const user = useAuthStore((s) => s.user);
    const token = useAuthStore((s) => s.token);
    const connectAndQueue = useGameStore((s) => s.connectAndQueue);

    useEffect(() => {
        // Pull the latest /me so other tabs see updated rank.
        refreshMe().catch(() => {});

        // Haptic feedback for the win.
        if (matchOver?.result === 'win') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else if (matchOver?.result === 'loss') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }

        // Frequency-capped post-match interstitial. Skipped for ads-removed
        // users; gameStore handles cap + cooldown + skip-after-loss.
        const adsRemoved = user && 'ads' in user ? user.ads.removed : false;
        if (!adsRemoved && shouldShowInterstitial()) {
            // Small delay so the user sees their result first.
            setTimeout(() => {
                markInterstitialShown();
                showInterstitial().catch(() => {});
            }, 800);
        }
    }, [matchOver, refreshMe, shouldShowInterstitial, markInterstitialShown, user]);

    if (!matchOver) {
        return (
            <SafeAreaView style={styles.safe}>
                <Text style={styles.empty} allowFontScaling={false}>No match data.</Text>
            </SafeAreaView>
        );
    }

    function onPlayAgain() {
        reset();
        if (token) {
            connectAndQueue(token);
            router.replace('/(app)/matchmaking');
        }
    }

    function onHome() {
        reset();
        router.replace('/(app)');
    }

    const tier = matchOver.newRankTier as RankTier;
    const deltaSign =
        matchOver.rankDelta > 0 ? '+' : matchOver.rankDelta < 0 ? '' : '±';

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text
                    style={[styles.headline, { color: RESULT_COLOR[matchOver.result] }]}
                    allowFontScaling={false}
                >
                    {RESULT_TITLE[matchOver.result]}
                </Text>

                <Text style={styles.outcomeBlurb} allowFontScaling={false}>
                    {outcomeBlurb(matchOver.outcome)}
                </Text>

                <View style={styles.wordCard}>
                    <Text style={styles.wordLabel} allowFontScaling={false}>The word was</Text>
                    <Text style={styles.word} allowFontScaling={false}>{matchOver.word}</Text>
                    {matchOver.wordTheme ? (
                        <Text style={styles.wordTheme} allowFontScaling={false}>
                            “{matchOver.wordTheme}”
                        </Text>
                    ) : null}
                </View>

                <View style={styles.metaRow}>
                    <View style={styles.metaCard}>
                        <Text style={styles.metaLabel} allowFontScaling={false}>Rank</Text>
                        <Text
                            style={[
                                styles.metaValue,
                                {
                                    color:
                                        matchOver.rankDelta > 0
                                            ? colors.primary
                                            : matchOver.rankDelta < 0
                                            ? colors.danger
                                            : colors.text,
                                },
                            ]}
                            allowFontScaling={false}
                        >
                            {deltaSign}
                            {matchOver.rankDelta}
                        </Text>
                        <RankBadge tier={tier} points={matchOver.newRankPoints} size="sm" />
                    </View>
                    <View style={styles.metaCard}>
                        <Text style={styles.metaLabel} allowFontScaling={false}>Battle Pass XP</Text>
                        <Text style={[styles.metaValue, { color: colors.warning }]} allowFontScaling={false}>
                            +{matchOver.battlePassXpAwarded}
                        </Text>
                    </View>
                </View>

                <RewardsCard matchOver={matchOver} />

                <Text style={styles.sectionLabel} allowFontScaling={false}>
                    Boards revealed
                </Text>
                <View style={styles.boardsRow}>
                    <BoardColumn
                        title="You"
                        guesses={matchOver.yourGuesses}
                    />
                    <BoardColumn
                        title="Opponent"
                        guesses={matchOver.opponentGuesses}
                    />
                </View>

                <View style={styles.actions}>
                    <Button label="Play again" onPress={onPlayAgain} />
                    <Button label="Home" onPress={onHome} variant="ghost" />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function RewardsCard({ matchOver }: { matchOver: MatchOver }) {
    const coinsAwarded = matchOver.coinsAwarded ?? 0;
    const streak = matchOver.streakUpdate;
    const milestone = streak?.milestone;

    // Don't render an empty card.
    if (!coinsAwarded && !streak && !milestone) return null;

    return (
        <View style={styles.rewardsCard}>
            <View style={styles.rewardsHeader}>
                <Ionicons name="gift" size={16} color={colors.warning} />
                <Text style={styles.rewardsHeaderText} allowFontScaling={false}>
                    Rewards
                </Text>
            </View>

            {coinsAwarded > 0 ? (
                <RewardLine
                    icon="trophy"
                    iconColor={colors.warning}
                    label="Match win"
                    value={`+${coinsAwarded} coins`}
                />
            ) : null}

            {streak ? (
                <RewardLine
                    icon="flame"
                    iconColor={colors.danger}
                    label={`Day ${streak.playStreak} streak`}
                    value={`+${streak.dailyCoins} coins`}
                />
            ) : null}

            {milestone ? (
                <View style={styles.milestoneCard}>
                    <View style={styles.milestoneHeader}>
                        <Ionicons name="star" size={20} color={colors.warning} />
                        <Text style={styles.milestoneTitle} allowFontScaling={false}>
                            {milestone.day}-day milestone!
                        </Text>
                    </View>
                    <Text style={styles.milestoneDesc} allowFontScaling={false}>
                        +{milestone.coins} coins
                        {milestone.hintCredits > 0
                            ? ` and +${milestone.hintCredits} hint credit${milestone.hintCredits === 1 ? '' : 's'}`
                            : ''}
                    </Text>
                </View>
            ) : null}

            {matchOver.coinsTotal !== undefined ? (
                <Text style={styles.balanceLine} allowFontScaling={false}>
                    Coin balance: {matchOver.coinsTotal.toLocaleString()}
                </Text>
            ) : null}
        </View>
    );
}

function RewardLine({
    icon,
    iconColor,
    label,
    value,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    label: string;
    value: string;
}) {
    return (
        <View style={styles.rewardLine}>
            <View style={styles.rewardLineLeft}>
                <Ionicons name={icon} size={16} color={iconColor} />
                <Text style={styles.rewardLineLabel} allowFontScaling={false}>
                    {label}
                </Text>
            </View>
            <Text style={styles.rewardLineValue} allowFontScaling={false}>
                {value}
            </Text>
        </View>
    );
}

function BoardColumn({
    title,
    guesses,
}: {
    title: string;
    guesses: { guess: string; tiles: ('correct' | 'misplaced' | 'wrong')[] }[];
}) {
    return (
        <View style={styles.boardCol}>
            <Text style={styles.boardTitle} allowFontScaling={false}>{title}</Text>
            <View style={styles.boardGrid}>
                {guesses.length === 0 ? (
                    <Text style={styles.noGuesses} allowFontScaling={false}>
                        (no guesses)
                    </Text>
                ) : (
                    guesses.map((g, rowIdx) => (
                        <View key={`r-${rowIdx}`} style={styles.boardRow}>
                            {g.guess.split('').map((letter, colIdx) => (
                                <Tile
                                    key={`t-${rowIdx}-${colIdx}`}
                                    letter={letter}
                                    state={g.tiles[colIdx] ?? null}
                                    size="sm"
                                />
                            ))}
                        </View>
                    ))
                )}
            </View>
        </View>
    );
}

function outcomeBlurb(outcome: string): string {
    switch (outcome) {
        case 'p1_solved':
        case 'p2_solved':
            return 'Solved.';
        case 'p1_more_correct':
        case 'p2_more_correct':
            return 'Decided on letters in correct positions.';
        case 'tie':
            return 'Even count of correct positions. Tie.';
        case 'forfeit':
            return 'Opponent disconnected.';
        default:
            return '';
    }
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
    empty: {
        textAlign: 'center',
        color: colors.textDim,
        marginTop: spacing.xxl,
    },
    headline: {
        fontSize: 42,
        fontWeight: typography.weights.black,
        textAlign: 'center',
        letterSpacing: 2,
    },
    outcomeBlurb: {
        textAlign: 'center',
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        marginTop: -spacing.sm,
    },
    wordCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.sm,
        alignItems: 'center',
        gap: spacing.xs,
        borderWidth: 1,
        borderColor: colors.border,
    },
    wordLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
    },
    word: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
        letterSpacing: 6,
        fontFamily: typography.familyMono,
    },
    wordTheme: {
        color: colors.warning,
        fontSize: typography.sizes.sm,
        fontStyle: 'italic',
    },
    metaRow: { flexDirection: 'row', gap: spacing.sm },
    metaCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.xs,
        gap: spacing.xs,
        borderWidth: 1,
        borderColor: colors.border,
    },
    metaLabel: { color: colors.textDim, fontSize: typography.sizes.xs },
    metaValue: {
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        fontFamily: typography.familyMono,
    },
    sectionLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    boardsRow: { flexDirection: 'row', gap: spacing.md },
    boardCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
    boardTitle: {
        color: colors.text,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
    },
    boardGrid: { gap: 2 },
    boardRow: { flexDirection: 'row', gap: 2 },
    noGuesses: {
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
    },
    actions: { gap: spacing.sm, marginTop: spacing.lg },
    rewardsCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.sm,
    },
    rewardsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    rewardsHeaderText: {
        color: colors.text,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    rewardLine: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    rewardLineLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    rewardLineLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
    },
    rewardLineValue: {
        color: colors.warning,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
        fontFamily: typography.familyMono,
    },
    milestoneCard: {
        backgroundColor: 'rgba(244,185,64,0.1)',
        borderRadius: radius.sm,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.warning,
        gap: spacing.xs,
    },
    milestoneHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    milestoneTitle: {
        color: colors.warning,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    milestoneDesc: {
        color: colors.text,
        fontSize: typography.sizes.sm,
    },
    balanceLine: {
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        fontFamily: typography.familyMono,
        textAlign: 'right',
        marginTop: spacing.xs,
    },
});
