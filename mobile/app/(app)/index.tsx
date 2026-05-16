// Home / "Play" tab. Big Play button is the primary action — everything
// else on this screen exists to give the player a sense of momentum
// (their rank, their streak, what they're playing for).

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { useAuthStore } from '../../src/store/authStore';
import { useGameStore } from '../../src/store/gameStore';
import { adsAvailable, showRewarded } from '../../src/ads';
import { adsApi } from '../../src/api/resources';
import { AdLoadingOverlay } from '../../src/components/ui/AdLoadingOverlay';
import { makeThemedStyles, colors, type RankTier } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

const TIER_THRESHOLDS: { tier: RankTier; min: number }[] = [
    { tier: 'stone', min: 0 },
    { tier: 'bronze', min: 1100 },
    { tier: 'silver', min: 1300 },
    { tier: 'gold', min: 1500 },
    { tier: 'platinum', min: 1700 },
    { tier: 'diamond', min: 1900 },
    { tier: 'master', min: 2100 },
    { tier: 'legend', min: 2400 },
];

function nextThreshold(points: number): { nextTier: RankTier | null; needed: number; progress: number } {
    for (let i = 0; i < TIER_THRESHOLDS.length - 1; i++) {
        const cur = TIER_THRESHOLDS[i]!;
        const next = TIER_THRESHOLDS[i + 1]!;
        if (points >= cur.min && points < next.min) {
            return {
                nextTier: next.tier,
                needed: next.min - points,
                progress: (points - cur.min) / (next.min - cur.min),
            };
        }
    }
    return { nextTier: null, needed: 0, progress: 1 };
}

export default function Home() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const refreshMe = useAuthStore((s) => s.refreshMe);
    const token = useAuthStore((s) => s.token);
    const connectAndQueue = useGameStore((s) => s.connectAndQueue);
    // Active-match detection. The gameStore phase persists across tab
    // navigation (it's a Zustand global), so if the user accidentally
    // tapped another tab mid-match we can offer them a Resume button.
    const gamePhase = useGameStore((s) => s.phase);
    const hasActiveMatch = gamePhase === 'playing' || gamePhase === 'matched';
    const [adBusy, setAdBusy] = useState(false);

    useEffect(() => {
        // Refresh /me when the home screen mounts so rank/win counts are
        // current after a match.
        refreshMe().catch(() => {});
    }, [refreshMe]);

    if (!user || !token) {
        return null; // _layout will redirect to (auth)
    }

    const tier = (user.rankTier ?? 'stone') as RankTier;
    const points = user.rankPoints ?? 0;
    const { nextTier, needed, progress } = nextThreshold(points);

    function onPlay() {
        if (!token) return;
        // matchmaking.tsx kicks off the queue itself based on the mode
        // param (default: classic). Keeps the queueing logic in one place.
        router.push('/(app)/matchmaking');
    }

    // Daily bonus availability — uses the player's LOCAL day (not UTC) so
    // a Lagos player who claims at 11pm doesn't see "claim again at midnight UTC".
    const adsRemoved = 'ads' in user ? user.ads.removed : false;
    const lastDaily =
        'ads' in user && user.ads.lastDailyAdAt
            ? new Date(user.ads.lastDailyAdAt)
            : null;
    const dailyAlreadyClaimed =
        !!lastDaily && sameLocalDay(lastDaily, new Date());
    // Optimistic local lock — flips to true the instant the user taps the
    // button, before the server round-trip completes. Prevents double-claims.
    const [dailyLocallyClaimed, setDailyLocallyClaimed] = useState(false);
    const showDailyBonus =
        !adsRemoved &&
        adsAvailable() &&
        !dailyAlreadyClaimed &&
        !dailyLocallyClaimed;

    async function onDailyBonus() {
        if (!user) return;
        // Lock immediately so a fast double-tap can't fire two ads.
        setDailyLocallyClaimed(true);
        setAdBusy(true);
        try {
            const r = await showRewarded('daily_bonus', user.id);
            if (r.unavailable) {
                Alert.alert(
                    'Ads not available',
                    'Daily bonus needs the production / dev-client build (not Expo Go).'
                );
                setDailyLocallyClaimed(false); // ad never showed, allow retry
                return;
            }
            if (r.earned) {
                // Try the dev-claim fallback. In production this 404s and
                // we rely on the real SSV callback. In dev, AdMob can't reach
                // localhost so this is the only path that grants the reward.
                try {
                    await adsApi.devClaimReward('daily_bonus');
                } catch {
                    // 404 (production) or 409 (already claimed) — no-op,
                    // SSV will/has handled it.
                }
                // Refresh after a brief delay so the ad-rewards write settles.
                setTimeout(() => refreshMe().catch(() => {}), 1200);
                Alert.alert(
                    'Reward incoming',
                    '+30 coins, +75 BP XP, and a power-up. Updating…'
                );
            } else if (r.error) {
                Alert.alert('Ad error', r.error);
                setDailyLocallyClaimed(false); // failed, allow retry
            } else {
                // User dismissed the ad without earning. Reset so they can try again.
                setDailyLocallyClaimed(false);
            }
        } finally {
            setAdBusy(false);
        }
    }

    const totalGames = user.wins + user.losses;
    const winRate = totalGames === 0 ? 0 : Math.round((user.wins / totalGames) * 100);

    return (
        <SafeAreaView style={styles.safe}>
            <AdLoadingOverlay visible={adBusy} label="Loading your reward…" />
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Text style={styles.greeting} allowFontScaling={false}>
                        Hey, <Text style={{ color: colors.primary }}>{user.username}</Text>
                    </Text>
                </View>

                <View style={styles.rankCard}>
                    <RankBadge tier={tier} points={points} size="lg" />
                    <View style={styles.progressWrap}>
                        <View style={styles.progressTrack}>
                            <View
                                style={[
                                    styles.progressFill,
                                    { width: `${Math.min(100, Math.max(0, progress * 100))}%` },
                                ]}
                            />
                        </View>
                        <Text style={styles.progressLabel} allowFontScaling={false}>
                            {nextTier
                                ? `${needed} pts to ${nextTier.toUpperCase()}`
                                : 'Top tier — defend it.'}
                        </Text>
                    </View>
                </View>

                <View style={styles.statsRow}>
                    <Stat label="Wins" value={String(user.wins)} />
                    <Stat label="Losses" value={String(user.losses)} />
                    <Stat label="Win rate" value={`${winRate}%`} />
                    {'winStreak' in user ? (
                        <Stat label="Streak" value={String(user.winStreak ?? 0)} />
                    ) : null}
                </View>

                <CoinStreakCard user={user as { coins?: number; streak?: { playStreak: number; lastPlayDate: string | null } }} />

                <View style={styles.playWrap}>
                    {hasActiveMatch ? (
                        <View style={styles.resumeCard}>
                            <View style={styles.resumeHeader}>
                                <Ionicons
                                    name="play-circle"
                                    size={22}
                                    color={colors.warning}
                                />
                                <Text
                                    style={styles.resumeTitle}
                                    allowFontScaling={false}
                                >
                                    Match in progress
                                </Text>
                            </View>
                            <Text
                                style={styles.resumeBody}
                                allowFontScaling={false}
                            >
                                You stepped away from a live game. Jump back
                                in before the timer runs out.
                            </Text>
                            <Button
                                label="RESUME MATCH"
                                onPress={() => router.push('/(app)/match')}
                                style={{ height: 56, marginTop: spacing.sm }}
                            />
                        </View>
                    ) : (
                        <>
                            <Button
                                label="PLAY"
                                onPress={onPlay}
                                style={{ height: 64 }}
                            />
                            <Text style={styles.playHint} allowFontScaling={false}>
                                90 seconds. Same word as your opponent.
                                Fastest solver wins.
                            </Text>
                        </>
                    )}
                </View>

                {/* Quick navigation grid for the new game modes + utility
                    screens. Each card is a small tile that routes to a
                    full-screen flow. */}
                <View style={styles.quickGrid}>
                    <QuickCard
                        icon="calendar"
                        label="Daily"
                        onPress={() => router.push('/(app)/daily')}
                    />
                    <QuickCard
                        icon="eye"
                        label="Mystery"
                        onPress={() => router.push('/(app)/mystery')}
                    />
                    <QuickCard
                        icon="people"
                        label="Friends"
                        onPress={() => router.push('/(app)/friends')}
                    />
                    <QuickCard
                        icon="film"
                        label="Replays"
                        onPress={() => router.push('/(app)/replays')}
                    />
                    <QuickCard
                        icon="settings"
                        label="Settings"
                        onPress={() => router.push('/(app)/settings')}
                    />
                </View>

                {showDailyBonus ? (
                    <View style={styles.dailyCard}>
                        <View style={styles.dailyHeader}>
                            <Ionicons name="gift" size={18} color={colors.warning} />
                            <Text style={styles.dailyTitle} allowFontScaling={false}>
                                Daily Bonus
                            </Text>
                        </View>
                        <Text style={styles.dailyDesc} allowFontScaling={false}>
                            Watch a short ad → +75 Battle Pass XP and a random power-up.
                        </Text>
                        <Button
                            label="Watch ad"
                            onPress={onDailyBonus}
                            busy={adBusy}
                            variant="secondary"
                            style={{ height: 44 }}
                        />
                    </View>
                ) : null}

                <View style={styles.tipsCard}>
                    <View style={styles.tipsHeader}>
                        <Ionicons name="bulb" size={16} color={colors.warning} />
                        <Text style={styles.tipsTitle} allowFontScaling={false}>Tip</Text>
                    </View>
                    <Text style={styles.tipText} allowFontScaling={false}>
                        Win streaks of 3, 5, 10… award a Reveal power-up. Power-ups
                        are earned, not bought.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.stat}>
            <Text style={styles.statValue} allowFontScaling={false}>{value}</Text>
            <Text style={styles.statLabel} allowFontScaling={false}>{label}</Text>
        </View>
    );
}

function QuickCard({
    icon,
    label,
    onPress,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.quickCard,
                pressed ? { opacity: 0.85, transform: [{ scale: 0.97 }] } : null,
            ]}
        >
            <Ionicons name={icon} size={22} color={colors.primary} />
            <Text style={styles.quickLabel} allowFontScaling={false}>
                {label}
            </Text>
        </Pressable>
    );
}

const MILESTONES = [5, 10, 25, 50, 100];
function nextMilestone(streak: number): number | null {
    return MILESTONES.find((m) => m > streak) ?? null;
}

function CoinStreakCard({
    user,
}: {
    user: { coins?: number; streak?: { playStreak: number; lastPlayDate: string | null } };
}) {
    const coins = user.coins ?? 0;
    const streak = user.streak?.playStreak ?? 0;
    const lastPlayDate = user.streak?.lastPlayDate ?? null;
    const playedToday =
        !!lastPlayDate && lastPlayDate === new Date().toISOString().slice(0, 10);
    const next = nextMilestone(streak);

    return (
        <View style={styles.coinStreakCard}>
            <View style={styles.coinRow}>
                <View style={styles.coinChip}>
                    <Ionicons name="logo-bitcoin" size={16} color={colors.warning} />
                    <Text style={styles.coinText} allowFontScaling={false}>
                        {coins.toLocaleString()}
                    </Text>
                </View>
                <View style={styles.streakChip}>
                    <Ionicons name="flame" size={16} color={colors.danger} />
                    <Text style={styles.coinText} allowFontScaling={false}>
                        {streak} day{streak === 1 ? '' : 's'}
                    </Text>
                </View>
            </View>
            <Text style={styles.streakHint} allowFontScaling={false}>
                {playedToday
                    ? "Today's streak is locked in. Come back tomorrow."
                    : streak === 0
                    ? 'Play one match today to start a streak.'
                    : `Play one match today to keep your ${streak}-day streak.`}
            </Text>
            {next ? (
                <Text style={styles.streakNext} allowFontScaling={false}>
                    Next milestone: day {next} (+ coins & a hint credit)
                </Text>
            ) : null}
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
    header: { marginTop: spacing.lg },
    greeting: {
        fontSize: typography.sizes.xl,
        color: colors.text,
        fontWeight: typography.weights.bold,
    },
    rankCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.md,
    },
    progressWrap: { gap: spacing.xs },
    progressTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.primary,
    },
    progressLabel: {
        fontSize: typography.sizes.xs,
        color: colors.textDim,
        fontFamily: typography.familyMono,
    },
    statsRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    stat: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    statValue: {
        fontSize: typography.sizes.lg,
        color: colors.text,
        fontWeight: typography.weights.bold,
    },
    statLabel: {
        fontSize: typography.sizes.xs,
        color: colors.textDim,
        marginTop: spacing.xs,
    },
    quickGrid: {
        flexDirection: 'row',
        gap: spacing.xs,
        flexWrap: 'wrap',
    },
    quickCard: {
        flex: 1,
        minWidth: 60,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xs,
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: colors.border,
    },
    quickLabel: {
        color: colors.text,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
    },
    playWrap: { gap: spacing.sm },
    playHint: {
        textAlign: 'center',
        color: colors.textDim,
        fontSize: typography.sizes.sm,
    },
    resumeCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.warning,
        gap: spacing.xs,
    },
    resumeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    resumeTitle: {
        color: colors.warning,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
        letterSpacing: 0.5,
    },
    resumeBody: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        lineHeight: 18,
    },
    tipsCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.xs,
    },
    tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    tipsTitle: {
        color: colors.warning,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
    },
    tipText: { color: colors.textDim, fontSize: typography.sizes.sm },
    dailyCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.warning,
    },
    dailyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dailyTitle: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    dailyDesc: { color: colors.textDim, fontSize: typography.sizes.sm },
    coinStreakCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    coinRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    coinChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.pill,
    },
    streakChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.pill,
    },
    coinText: {
        color: colors.text,
        fontWeight: typography.weights.bold,
        fontFamily: typography.familyMono,
    },
    streakHint: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
    },
    streakNext: {
        color: colors.warning,
        fontSize: typography.sizes.xs,
    },
}));

/**
 * Same calendar day in the player's LOCAL timezone? Mirrors server-side
 * sameLocalDay so the UI's "already claimed" check matches what the server
 * would say.
 */
function sameLocalDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}
