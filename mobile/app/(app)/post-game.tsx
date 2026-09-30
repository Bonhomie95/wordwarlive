// Post-game screen. Shows the outcome, rank/XP changes, the answer, and
// both players' guess histories side-by-side so the player can analyze how
// the match played out.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { impact, notify, ImpactStyle, NotificationType } from '../../src/lib/haptics';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { AdLoadingOverlay } from '../../src/components/ui/AdLoadingOverlay';
import { Screen } from '../../src/components/ui/Screen';
import { HeroTitle, MonoLabel, Card } from '../../src/components/ui/primitives';
import { Tile } from '../../src/components/game/Tile';
import { VictoryAnim } from '../../src/components/game/VictoryAnim';
import { RankReveal } from '../../src/components/game/RankReveal';
import { CountUp } from '../../src/components/ui/CountUp';
import { PopIn } from '../../src/components/ui/PopIn';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { tierFromPoints, tierProgress } from '../../src/lib/ranks';
import { victoryKind } from '../../src/lib/cosmetics';
import { useGameStore } from '../../src/store/gameStore';
import { useAuthStore } from '../../src/store/authStore';
import { showInterstitial } from '../../src/ads';
import { buildMatchShareMessage, shareText } from '../../src/share/shareResult';
import type { MatchOver } from '../../src/types/index';
import {
    makeThemedStyles,
    colors,
    useThemeStore,
    type RankTier,
} from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

export default function PostGame() {
    const router = useRouter();
    const matchOver = useGameStore((s) => s.matchOver);
    const matchFound = useGameStore((s) => s.matchFound);
    const reset = useGameStore((s) => s.reset);
    const shouldShowInterstitial = useGameStore((s) => s.shouldShowInterstitial);
    const markInterstitialShown = useGameStore((s) => s.markInterstitialShown);
    const refreshMe = useAuthStore((s) => s.refreshMe);
    const user = useAuthStore((s) => s.user);
    const [interstitialLoading, setInterstitialLoading] = useState(false);
    // One-shot guard per match. Without it the refresh/interstitial effect
    // re-runs every time `user` changes (refreshMe below updates it!) —
    // which re-triggered side effects in a loop, even after navigating
    // away, since expo-router keeps this screen mounted in the stack.
    const handledMatchRef = useRef<string | null>(null);

    // Dev-only preview of the post-game moments (rank up/down, milestone):
    // open wordwar://post-game?demo=rankup|rankdown|milestone.
    const params = useLocalSearchParams<{ demo?: string }>();
    useEffect(() => {
        if (__DEV__ && params.demo) useGameStore.setState({ matchOver: demoMatchOver(params.demo) });
    }, [params.demo]);

    // Rank transition data. Older servers omit the "previous" fields.
    const prevPoints = matchOver
        ? matchOver.previousRankPoints ?? matchOver.newRankPoints - matchOver.rankDelta
        : 0;
    const prevTier = matchOver ? matchOver.previousRankTier ?? tierFromPoints(prevPoints) : 'stone';
    const tierChanged = !!matchOver && prevTier !== matchOver.newRankTier;
    const [reveal, setReveal] = useState<'pending' | 'showing' | 'done'>('done');
    const dismissReveal = useCallback(() => setReveal('done'), []);

    // Progress bar animates from the old position to the new one; a tier
    // change sweeps through the end of the bar and restarts in the new band.
    const reduced = useReducedMotion();
    const barProgress = useSharedValue(0);
    useEffect(() => {
        if (!matchOver) return;
        const target = tierProgress(matchOver.newRankPoints);
        if (reduced) { barProgress.value = target; return; }
        const up = matchOver.newRankPoints > prevPoints;
        barProgress.value = tierProgress(prevPoints);
        const ease = { duration: 650, easing: Easing.out(Easing.cubic) };
        barProgress.value = withDelay(
            500,
            tierChanged
                ? withSequence(
                      withTiming(up ? 1 : 0, ease),
                      withTiming(up ? 0 : 1, { duration: 0 }),
                      withTiming(target, ease)
                  )
                : withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) })
        );
    }, [matchOver, prevPoints, tierChanged, reduced, barProgress]);
    const barStyle = useAnimatedStyle(() => ({ width: `${barProgress.value * 100}%` }));

    // Result haptic — fires only while this screen is actually FOCUSED,
    // exactly once per match. On blur (Home, back, tab switch — anything
    // that takes the victory/defeat page off screen) any vibration still
    // running is cancelled immediately.
    const hapticMatchRef = useRef<string | null>(null);
    useFocusEffect(
        useCallback(() => {
            if (matchOver && hapticMatchRef.current !== matchOver.matchId) {
                hapticMatchRef.current = matchOver.matchId;
                if (matchOver.result === 'win') {
                    notify(NotificationType.Success);
                } else if (matchOver.result === 'loss') {
                    notify(NotificationType.Warning);
                }
            }
            return () => {
                Vibration.cancel();
            };
        }, [matchOver])
    );

    useEffect(() => {
        if (!matchOver) return;
        if (handledMatchRef.current === matchOver.matchId) return;
        handledMatchRef.current = matchOver.matchId;

        // Pull the latest /me so other tabs see updated rank.
        refreshMe().catch(() => {});

        // A promotion/demotion gets its own moment before anything else
        // (the ad waits for it).
        if (tierChanged) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot per match, guarded by handledMatchRef
            setReveal('pending');
            const t = setTimeout(() => setReveal('showing'), 900);
            return () => clearTimeout(t);
        }
        setReveal('done');
    }, [matchOver, refreshMe, tierChanged]);

    const interstitialRef = useRef<string | null>(null);
    useEffect(() => {
        if (!matchOver || reveal !== 'done') return;
        if (interstitialRef.current === matchOver.matchId) return;
        interstitialRef.current = matchOver.matchId;

        // Frequency-capped post-match interstitial. Skipped for ads-removed
        // users; gameStore handles cap + cooldown + skip-after-loss.
        const adsRemoved = user && 'ads' in user ? user.ads.removed : false;
        if (!adsRemoved && shouldShowInterstitial()) {
            // Small delay so the user sees their result first.
            setTimeout(() => {
                markInterstitialShown();
                setInterstitialLoading(true);
                // Overlay blocks input while the ad loads/plays; the ads
                // module guarantees the promise resolves (load timeout), so
                // the overlay can never get stuck.
                showInterstitial()
                    .catch(() => {})
                    .finally(() => setInterstitialLoading(false));
            }, 800);
        }
    }, [matchOver, reveal, shouldShowInterstitial, markInterstitialShown, user]);

    if (!matchOver) {
        return (
            <Screen>
                <Text style={styles.empty} allowFontScaling={false}>No match data.</Text>
            </Screen>
        );
    }

    // Mystery matches have no "play again" — you'd need to submit a fresh
    // word, so the only action is going home (Mystery tab → new word).
    const isMystery = matchFound?.mode === 'mystery';

    function onShare() {
        if (!matchOver) return;
        impact(ImpactStyle.Light);
        const message = buildMatchShareMessage({
            result: matchOver.result,
            guesses: matchOver.yourGuesses,
            solved: matchOver.yourGuesses.some((g) =>
                g.tiles.every((t) => t === 'correct')
            ),
            opponentName: matchFound?.opponent?.username,
            mode: isMystery ? 'mystery' : 'classic',
            matchDurationSec: matchOver.matchDurationSec,
            highContrast: useThemeStore.getState().colorBlind,
        });
        shareText(message);
    }

    function onPlayAgain() {
        // Don't reset/queue here — matchmaking.tsx does both on mount.
        reset();
        router.navigate('/(app)/matchmaking');
    }

    function onHome() {
        reset();
        router.navigate('/(app)');
    }

    const tier = matchOver.newRankTier as RankTier;
    const result = matchOver.result;
    const resultColor =
        result === 'win' ? colors.primary : result === 'loss' ? colors.danger : colors.textDim;
    const title = result === 'win' ? 'VICTORY!' : result === 'loss' ? 'DEFEAT' : 'DRAW';
    const oppName = matchFound?.opponent?.username ?? 'your rival';
    const subtitle =
        result === 'win'
            ? `You defeated ${oppName}`
            : result === 'loss'
            ? `${oppName} won this round`
            : 'Evenly matched';
    const durationSec = matchOver.matchDurationSec ?? 0;

    const equippedVictory =
        user && 'equipped' in user ? user.equipped?.victoryAnim : null;
    const victory = result === 'win' ? victoryKind(equippedVictory) : null;

    return (
        <Screen>
            {victory ? <VictoryAnim kind={victory} /> : null}
            {reveal === 'showing' ? (
                <RankReveal from={prevTier} to={tier} points={matchOver.newRankPoints} onDone={dismissReveal} />
            ) : null}
            <AdLoadingOverlay visible={interstitialLoading} label="Quick ad break…" />
            {/* Icon actions live at the top so they're visible on every
                screen size — the scrollable summary below can be tall. */}
            <View style={styles.topRow}>
                <IconAction icon="home" label="Home" onPress={onHome} />
                <MonoLabel>Match result</MonoLabel>
                <IconAction icon="share-social" label="Share result" onPress={onShare} />
            </View>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Outcome hero */}
                <View style={styles.heroWrap}>
                    <Ionicons
                        name={result === 'win' ? 'trophy' : result === 'loss' ? 'skull-outline' : 'remove-circle-outline'}
                        size={40}
                        color={resultColor}
                    />
                    <HeroTitle color={resultColor} size={typography.sizes.xxl}>
                        {title}
                    </HeroTitle>
                    <Text style={styles.subtitle} allowFontScaling={false}>
                        {result === 'win' ? 'You defeated ' : result === 'loss' ? `${oppName} won ` : subtitle}
                        {result !== 'tie' ? (
                            <Text style={{ color: result === 'win' ? colors.danger : colors.primary }}>
                                {result === 'win' ? oppName : ''}
                            </Text>
                        ) : null}
                    </Text>
                </View>

                {/* Elo / rewards summary */}
                <Card glowing accent={resultColor} style={styles.eloCard}>
                    <View style={styles.eloTop}>
                        <View style={styles.eloRank}>
                            <RankBadge tier={tier} size="sm" />
                            <Text style={styles.eloTier} allowFontScaling={false}>
                                <CountUp from={prevPoints} to={matchOver.newRankPoints} delayMs={500} durationMs={900} style={styles.eloTier} />
                                {' '}RP
                            </Text>
                        </View>
                        {matchOver.rankDelta === 0 ? (
                            <Text style={[styles.eloDelta, { color: colors.textDim }]} allowFontScaling={false}>
                                ±0 Elo
                            </Text>
                        ) : (
                            <CountUp
                                to={matchOver.rankDelta}
                                signed
                                suffix=" Elo"
                                delayMs={300}
                                durationMs={700}
                                style={[
                                    styles.eloDelta,
                                    { color: matchOver.rankDelta > 0 ? colors.primary : colors.danger },
                                ]}
                            />
                        )}
                    </View>
                    <View style={styles.eloBarTrack}>
                        <Animated.View style={[styles.eloBarFill, barStyle]} />
                    </View>
                    <View style={styles.eloBottom}>
                        <View style={styles.eloStat}>
                            <Ionicons name="ellipse" size={13} color={colors.warning} />
                            <CountUp to={matchOver.coinsAwarded ?? 0} prefix="+" suffix=" coins" delayMs={700} style={styles.eloStatText} />
                        </View>
                        <View style={styles.eloStat}>
                            <Ionicons name="flash" size={13} color={colors.info} />
                            <CountUp to={matchOver.battlePassXpAwarded} prefix="+" suffix=" XP" delayMs={850} style={styles.eloStatText} />
                        </View>
                        <View style={styles.eloStat}>
                            <Ionicons name="time-outline" size={13} color={colors.textDim} />
                            <Text style={styles.eloStatText} allowFontScaling={false}>
                                {formatDuration(durationSec)}
                            </Text>
                        </View>
                    </View>
                </Card>

                {/* The word */}
                <View style={styles.wordCard}>
                    <MonoLabel>The word was</MonoLabel>
                    <Text style={styles.word} allowFontScaling={false}>
                        {matchOver.word}
                    </Text>
                    {matchOver.wordTheme ? (
                        <Text style={styles.wordTheme} allowFontScaling={false}>
                            “{matchOver.wordTheme}”
                        </Text>
                    ) : null}
                </View>

                <RewardsCard matchOver={matchOver} />

                {/* Boards */}
                <View style={styles.boardsRow}>
                    <BoardColumn title="You" guesses={matchOver.yourGuesses} />
                    <BoardColumn title="Opponent" guesses={matchOver.opponentGuesses} />
                </View>

            </ScrollView>
            {/* Sticky primary action — never scrolls out of view. */}
            <View style={styles.footer}>
                {isMystery ? (
                    <Button label="Back to Home" onPress={onHome} icon="home" />
                ) : (
                    <Button label="Play Again" onPress={onPlayAgain} icon="refresh" />
                )}
            </View>
        </Screen>
    );
}

function IconAction({
    icon,
    label,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.iconBtn, pressed ? { opacity: 0.7 } : null]}
        >
            <Ionicons name={icon} size={20} color={colors.text} />
        </Pressable>
    );
}

function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
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
                    label={matchOver.result === 'win' ? 'Match win' : 'Match played'}
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
                <PopIn delayMs={1100} style={styles.milestoneCard}>
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
                </PopIn>
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


/** Dev-only sample payloads for previewing the post-game moments. */
function demoMatchOver(kind: string): MatchOver {
    const win = kind !== 'rankdown';
    const base: MatchOver = {
        matchId: `demo-${kind}-${Date.now()}`,
        result: win ? 'win' : 'loss',
        outcome: win ? 'p1_solved' : 'p2_solved',
        word: 'TRAIN',
        wordTheme: 'Something that runs on rails.',
        rankDelta: win ? 27 : -25,
        previousRankPoints: win ? 1085 : 1104,
        previousRankTier: win ? 'stone' : 'bronze',
        newRankPoints: win ? 1112 : 1079,
        newRankTier: win ? 'bronze' : 'stone',
        battlePassXpAwarded: win ? 60 : 20,
        coinsAwarded: win ? 10 : 3,
        coinsTotal: 245,
        matchDurationSec: 84,
        yourGuesses: [
            { guess: 'CRANE', tiles: ['wrong', 'correct', 'misplaced', 'misplaced', 'wrong'] },
            { guess: 'TRAIN', tiles: ['correct', 'correct', 'correct', 'correct', 'correct'] },
        ],
        opponentGuesses: [
            { guess: 'SLATE', tiles: ['wrong', 'wrong', 'misplaced', 'misplaced', 'wrong'] },
            { guess: 'GRAIN', tiles: ['wrong', 'correct', 'correct', 'correct', 'correct'] },
        ],
    };
    if (kind === 'milestone') {
        base.previousRankPoints = 1040; base.previousRankTier = 'stone';
        base.newRankPoints = 1067; base.newRankTier = 'stone';
        base.streakUpdate = { playStreak: 7, dailyCoins: 10, milestone: { day: 7, coins: 75, hintCredits: 1 } };
    }
    return base;
}

const styles = makeThemedStyles(() => StyleSheet.create({
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.lg },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
    },
    footer: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.bg,
    },
    empty: {
        textAlign: 'center',
        color: colors.textDim,
        marginTop: spacing.xxl,
    },
    heroWrap: { alignItems: 'center', gap: spacing.xs },
    subtitle: {
        color: colors.textDim,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.sm,
        textAlign: 'center',
    },
    eloCard: { gap: spacing.md },
    eloTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    eloRank: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    eloTier: {
        color: colors.text,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.sm,
    },
    eloDelta: {
        fontFamily: typography.familyMonoBold,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.black,
    },
    eloBarTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
    },
    eloBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
    eloBottom: { flexDirection: 'row', justifyContent: 'space-between' },
    eloStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    eloStatText: {
        color: colors.textDim,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.xs,
    },
    wordCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
        alignItems: 'center',
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    word: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
        letterSpacing: 6,
        fontFamily: typography.familyMonoBold,
    },
    wordTheme: {
        color: colors.warning,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.sm,
        fontStyle: 'italic',
    },
    boardsRow: { flexDirection: 'row', gap: spacing.md },
    boardCol: { flex: 1, alignItems: 'center', gap: spacing.sm },
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
    rewardsCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
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
}));
