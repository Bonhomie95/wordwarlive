// Home / "Play" tab. The big glowing Play button is the primary action;
// everything else gives the player a sense of momentum (rank, streak, what
// they're playing for). Purely a visual revamp — all logic is unchanged.

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { OnboardingModal } from '../../src/components/ui/OnboardingModal';
import { Screen } from '../../src/components/ui/Screen';
import { TopBar } from '../../src/components/ui/TopBar';
import { Card, MonoLabel, StatTile } from '../../src/components/ui/primitives';
import { Button } from '../../src/components/ui/Button';
import { useAuthStore } from '../../src/store/authStore';
import { useGameStore } from '../../src/store/gameStore';
import { adsAvailable, preloadRewarded, showRewarded } from '../../src/ads';
import { adsApi } from '../../src/api/resources';
import { AdLoadingOverlay } from '../../src/components/ui/AdLoadingOverlay';
import { makeThemedStyles, colors, type RankTier } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';
import { glow } from '../../src/theme/effects';

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

function nextThreshold(points: number): {
    nextTier: RankTier | null;
    needed: number;
    progress: number;
} {
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
    const gamePhase = useGameStore((s) => s.phase);
    const hasActiveMatch = gamePhase === 'playing' || gamePhase === 'matched';
    const [adBusy, setAdBusy] = useState(false);
    const [dailyLocallyClaimed, setDailyLocallyClaimed] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        refreshMe().catch(() => {});
    }, [refreshMe]);

    useEffect(() => {
        SecureStore.getItemAsync('wordwar.onboarded')
            .then((v) => {
                if (v !== '1') setShowOnboarding(true);
            })
            .catch(() => {});
    }, []);

    function dismissOnboarding() {
        setShowOnboarding(false);
        SecureStore.setItemAsync('wordwar.onboarded', '1').catch(() => {});
    }

    // Start fetching the rewarded ad as soon as the daily bonus is claimable so
    // CLAIM shows it instantly instead of making the user wait on the load.
    const userId = user?.id;
    const lastDailyAdAt = user && 'ads' in user ? user.ads.lastDailyAdAt : null;
    useEffect(() => {
        if (!userId || dailyLocallyClaimed || !adsAvailable()) return;
        if (lastDailyAdAt && sameLocalDay(new Date(lastDailyAdAt), new Date())) return;
        preloadRewarded('daily_bonus', userId);
    }, [userId, lastDailyAdAt, dailyLocallyClaimed]);

    if (!user || !token) {
        return null; // _layout will redirect to (auth)
    }

    const tier = (user.rankTier ?? 'stone') as RankTier;
    const points = user.rankPoints ?? 0;
    const { nextTier, needed, progress } = nextThreshold(points);

    function onPlay() {
        if (!token) return;
        router.push('/(app)/matchmaking');
    }

    const adsRemoved = 'ads' in user ? user.ads.removed : false;
    const lastDaily =
        'ads' in user && user.ads.lastDailyAdAt
            ? new Date(user.ads.lastDailyAdAt)
            : null;
    const dailyAlreadyClaimed = !!lastDaily && sameLocalDay(lastDaily, new Date());
    // Rewarded ads are opt-in, so the daily bonus stays after Remove Ads.
    void adsRemoved;
    const showDailyBonus = adsAvailable() && !dailyAlreadyClaimed && !dailyLocallyClaimed;

    async function onDailyBonus() {
        if (!user) return;
        setDailyLocallyClaimed(true);
        setAdBusy(true);
        try {
            const r = await showRewarded('daily_bonus', user.id);
            if (r.unavailable) {
                Alert.alert(
                    'Ads not available',
                    'Daily bonus needs the production / dev-client build (not Expo Go).'
                );
                setDailyLocallyClaimed(false);
                return;
            }
            if (r.earned) {
                try {
                    await adsApi.devClaimReward('daily_bonus');
                } catch {
                    // 404 (prod) / 409 (already) — no-op; SSV handles it.
                }
                setTimeout(() => refreshMe().catch(() => {}), 1200);
                Alert.alert('Reward incoming', '+30 coins, +75 BP XP, and a power-up. Updating…');
            } else if (r.error) {
                Alert.alert('Ad error', r.error);
                setDailyLocallyClaimed(false);
            } else {
                setDailyLocallyClaimed(false);
            }
        } finally {
            setAdBusy(false);
        }
    }

    const totalGames = user.wins + user.losses;
    const winRate = totalGames === 0 ? 0 : Math.round((user.wins / totalGames) * 100);
    const wlRatio =
        user.losses > 0 ? (user.wins / user.losses).toFixed(2) : String(user.wins);
    const winStreak = 'winStreak' in user ? user.winStreak ?? 0 : 0;
    const nextTierRP = points + needed;

    return (
        <Screen edges={['top']}>
            <OnboardingModal visible={showOnboarding} onDone={dismissOnboarding} />
            <AdLoadingOverlay visible={adBusy} label="Loading your reward…" />
            <TopBar />
            <ScrollView
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
            >
                {/* Rank card */}
                <Card glowing style={styles.rankCard}>
                    <View style={styles.rankRow}>
                        <RankBadge tier={tier} size="lg" />
                        <View style={styles.rankInfo}>
                            <MonoLabel>Current Rank</MonoLabel>
                            <Text style={styles.rankTier} allowFontScaling={false}>
                                {tier.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.progressTrack}>
                        <View
                            style={[
                                styles.progressFill,
                                { width: `${Math.min(100, Math.max(4, progress * 100))}%` },
                            ]}
                        />
                    </View>
                    <View style={styles.rankMeta}>
                        <MonoLabel color={colors.primary}>{points} RP</MonoLabel>
                        <MonoLabel>
                            {nextTier
                                ? `${nextTier.toUpperCase()} · ${nextTierRP} RP`
                                : 'TOP TIER'}
                        </MonoLabel>
                    </View>
                </Card>

                {/* Stat tiles */}
                <View style={styles.statsRow}>
                    <StatTile
                        value={wlRatio}
                        label="W/L Ratio"
                        icon={<Ionicons name="trending-up" size={18} color={colors.primary} />}
                    />
                    <StatTile
                        value={String(winStreak)}
                        label="Win Streak"
                        icon={<Ionicons name="flame" size={18} color={colors.warning} />}
                    />
                    <StatTile
                        value={`${winRate}%`}
                        label="Win Rate"
                        icon={<Ionicons name="ribbon" size={18} color={colors.info} />}
                    />
                </View>

                {/* Primary action */}
                {hasActiveMatch ? (
                    <Card accent={colors.warning} style={styles.resumeCard}>
                        <View style={styles.resumeHeader}>
                            <Ionicons name="play-circle" size={20} color={colors.warning} />
                            <Text style={styles.resumeTitle} allowFontScaling={false}>
                                Match in progress
                            </Text>
                        </View>
                        <Text style={styles.resumeBody} allowFontScaling={false}>
                            You stepped away from a live game. Jump back in before the
                            timer runs out.
                        </Text>
                        <Button
                            label="RESUME MATCH"
                            onPress={() => router.push('/(app)/match')}
                            style={{ marginTop: spacing.sm }}
                        />
                    </Card>
                ) : (
                    <Pressable
                        onPress={onPlay}
                        accessibilityRole="button"
                        accessibilityLabel="Play a ranked match"
                        style={({ pressed }) => [
                            styles.playBtn,
                            glow(colors.primary, 28, 0.6),
                            pressed ? { transform: [{ scale: 0.98 }], opacity: 0.95 } : null,
                        ]}
                    >
                        <Ionicons name="play" size={44} color={colors.bg} />
                        <Text style={styles.playLabel} allowFontScaling={false}>
                            PLAY
                        </Text>
                        <Text style={styles.playSub} allowFontScaling={false}>
                            RANKED 1V1
                        </Text>
                    </Pressable>
                )}

                {/* Modes */}
                <View style={styles.modesRow}>
                    <ModeCard icon="calendar-outline" label="Daily" onPress={() => router.push('/(app)/daily')} />
                    <ModeCard icon="eye-outline" label="Mystery" onPress={() => router.push('/(app)/mystery')} />
                    <ModeCard icon="people-outline" label="Friends" onPress={() => router.push('/(app)/friends')} />
                    <ModeCard icon="film-outline" label="Replays" onPress={() => router.push('/(app)/replays')} />
                </View>

                {/* Daily bonus */}
                {showDailyBonus ? (
                    <Card accent={colors.warning} style={styles.dailyCard}>
                        <View style={styles.dailyLeft}>
                            <Ionicons name="gift" size={22} color={colors.warning} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.dailyTitle} allowFontScaling={false}>
                                    Daily Bonus
                                </Text>
                                <Text style={styles.dailyDesc} allowFontScaling={false}>
                                    Watch an ad → coins, XP & a power-up
                                </Text>
                            </View>
                        </View>
                        <Pressable
                            onPress={onDailyBonus}
                            disabled={adBusy}
                            accessibilityRole="button"
                            accessibilityLabel="Claim daily bonus"
                            style={({ pressed }) => [
                                styles.claimBtn,
                                pressed ? { opacity: 0.8 } : null,
                            ]}
                        >
                            <Text style={styles.claimText} allowFontScaling={false}>
                                CLAIM
                            </Text>
                        </Pressable>
                    </Card>
                ) : null}
            </ScrollView>
        </Screen>
    );
}

function ModeCard({
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
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [
                styles.modeCard,
                pressed ? { opacity: 0.8, transform: [{ scale: 0.96 }] } : null,
            ]}
        >
            <Ionicons name={icon} size={22} color={colors.primary} />
            <Text style={styles.modeLabel} allowFontScaling={false}>
                {label}
            </Text>
        </Pressable>
    );
}

function sameLocalDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        scroll: {
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: spacing.xxl * 2,
            gap: spacing.lg,
        },
        rankCard: { gap: spacing.md },
        rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        rankInfo: { flex: 1, gap: 2 },
        rankTier: {
            color: colors.text,
            fontFamily: typography.familyDisplay,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.black,
            letterSpacing: 1,
        },
        progressTrack: {
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.surfaceElevated,
            overflow: 'hidden',
        },
        progressFill: {
            height: '100%',
            backgroundColor: colors.primary,
            borderRadius: 4,
        },
        rankMeta: { flexDirection: 'row', justifyContent: 'space-between' },
        statsRow: { flexDirection: 'row', gap: spacing.sm },
        playBtn: {
            backgroundColor: colors.primary,
            borderRadius: radius.xl,
            paddingVertical: spacing.xl,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            marginVertical: spacing.xs,
        },
        playLabel: {
            color: colors.bg,
            fontFamily: typography.familyDisplay,
            fontSize: 34,
            fontWeight: typography.weights.black,
            letterSpacing: 2,
        },
        playSub: {
            color: colors.bg,
            fontFamily: typography.familyMono,
            fontSize: 11,
            letterSpacing: 2,
            opacity: 0.7,
        },
        resumeCard: { gap: spacing.xs },
        resumeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
        resumeTitle: {
            color: colors.warning,
            fontFamily: typography.familyDisplay,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.bold,
        },
        resumeBody: { color: colors.textDim, fontSize: typography.sizes.sm, lineHeight: 19 },
        modesRow: { flexDirection: 'row', gap: spacing.sm },
        modeCard: {
            flex: 1,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: spacing.md,
            alignItems: 'center',
            gap: 6,
        },
        modeLabel: {
            color: colors.textDim,
            fontFamily: typography.familyMono,
            fontSize: 10,
            letterSpacing: 1,
            textTransform: 'uppercase',
        },
        dailyCard: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
        },
        dailyLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
        dailyTitle: {
            color: colors.text,
            fontFamily: typography.familyDisplay,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.bold,
        },
        dailyDesc: { color: colors.textDim, fontSize: typography.sizes.xs, marginTop: 1 },
        claimBtn: {
            borderWidth: 1,
            borderColor: colors.primary,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
        },
        claimText: {
            color: colors.primary,
            fontFamily: typography.familyMonoBold,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.bold,
            letterSpacing: 1,
        },
    })
);
