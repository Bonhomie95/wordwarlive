// Battle pass tab. Shows the current season, the player's progress, and
// each tier's free + premium reward. Tiers the player has unlocked become
// "Claim" buttons; once claimed they switch to "Owned". Premium track is
// gated behind a single $3.99 unlock per season.

import { useCallback, useState } from 'react';
import {
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { adsApi, battlePassApi } from '../../src/api/resources';
import { adsAvailable, showRewarded } from '../../src/ads';
import { useAuthStore } from '../../src/store/authStore';
import type { BattlePassResponse, BattlePassRewardView } from '../../src/types/index';
import { colors } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

export default function Pass() {
    const [data, setData] = useState<BattlePassResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [adBusy, setAdBusy] = useState(false);
    const [claimingKey, setClaimingKey] = useState<string | null>(null);
    const user = useAuthStore((s) => s.user);
    const refreshMe = useAuthStore((s) => s.refreshMe);

    const load = useCallback(async () => {
        try {
            const r = await battlePassApi.current();
            setData(r);
        } catch (err) {
            Alert.alert('Could not load battle pass', err instanceof Error ? err.message : '');
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    if (!data) {
        return (
            <SafeAreaView style={styles.safe}>
                <Text style={styles.empty} allowFontScaling={false}>Loading…</Text>
            </SafeAreaView>
        );
    }

    if (!data.active || !data.season || !data.you || !data.rewards) {
        return (
            <SafeAreaView style={styles.safe}>
                <Text style={styles.empty} allowFontScaling={false}>
                    No active season. Check back soon.
                </Text>
            </SafeAreaView>
        );
    }

    const { season, you, rewards } = data;
    const xpInTier = you.xp - you.currentTier * season.xpPerTier;
    const xpToNext = season.xpPerTier;
    const tierProgress = Math.min(1, xpInTier / xpToNext);

    // Group rewards by tier.
    const byTier: Record<number, BattlePassRewardView[]> = {};
    for (const r of rewards) {
        const arr = byTier[r.tier] ?? [];
        arr.push(r);
        byTier[r.tier] = arr;
    }
    const tierList = Object.keys(byTier)
        .map(Number)
        .sort((a, b) => a - b);

    async function onUpgrade() {
        Alert.alert(
            'Unlock Premium',
            'Premium track gives you access to all premium rewards this season for $3.99.\n\n(Receipt verification is stubbed in dev — production will go through StoreKit / Play Billing.)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Unlock',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            await battlePassApi.upgradePremium();
                            await load();
                        } catch (err) {
                            Alert.alert('Upgrade failed', err instanceof Error ? err.message : '');
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ]
        );
    }

    async function onClaim(reward: BattlePassRewardView) {
        const key = `${reward.tier}:${reward.track}`;
        setClaimingKey(key);
        try {
            await battlePassApi.claim(reward.tier, reward.track);
            await load();
        } catch (err) {
            Alert.alert('Claim failed', err instanceof Error ? err.message : '');
        } finally {
            setClaimingKey(null);
        }
    }

    async function onWatchXpBoost() {
        if (!user) return;
        setAdBusy(true);
        try {
            const r = await showRewarded('bp_xp_boost', user.id);
            if (r.unavailable) {
                Alert.alert(
                    'Ads not available',
                    'XP boost needs the production / dev-client build (not Expo Go).'
                );
                return;
            }
            if (r.earned) {
                // Dev fallback for localhost (SSV can't reach us).
                try {
                    await adsApi.devClaimReward('bp_xp_boost');
                } catch {
                    /* prod 404 / cap-exceeded 409 — no-op */
                }
                setTimeout(() => {
                    refreshMe().catch(() => {});
                    load().catch(() => {});
                }, 1200);
                Alert.alert('+50 XP incoming', 'Updating your battle pass…');
            } else if (r.error) {
                Alert.alert('Ad error', r.error);
            }
        } finally {
            setAdBusy(false);
        }
    }

    const adsRemoved = user && 'ads' in user ? user.ads.removed : false;
    const xpBoostsToday = user && 'ads' in user ? user.ads.xpBoostAdsToday : 0;
    const xpBoostLimit = user && 'ads' in user ? user.ads.xpBoostDailyLimit : 5;
    const xpBoostsRemaining = Math.max(0, xpBoostLimit - xpBoostsToday);
    const showXpBoost = !adsRemoved && adsAvailable() && xpBoostsRemaining > 0;

    return (
        <SafeAreaView style={styles.safe}>
            <FlatList
                data={tierList}
                keyExtractor={(t) => String(t)}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <View style={styles.header}>
                        <Text style={styles.title} allowFontScaling={false}>
                            {season.name}
                        </Text>
                        <Text style={styles.subtitle} allowFontScaling={false}>
                            Tier {you.currentTier} / {season.maxTier}
                        </Text>
                        <View style={styles.progressTrack}>
                            <View
                                style={[
                                    styles.progressFill,
                                    { width: `${tierProgress * 100}%` },
                                ]}
                            />
                        </View>
                        <Text style={styles.progressLabel} allowFontScaling={false}>
                            {xpInTier} / {xpToNext} XP to next tier
                        </Text>

                        {!you.premium ? (
                            <View style={styles.upgradeCard}>
                                <View style={styles.upgradeTextWrap}>
                                    <Text style={styles.upgradeTitle} allowFontScaling={false}>
                                        Unlock Premium track
                                    </Text>
                                    <Text style={styles.upgradeSub} allowFontScaling={false}>
                                        $3.99 / season — earn premium-only cosmetics
                                    </Text>
                                </View>
                                <Button
                                    label="Unlock"
                                    onPress={onUpgrade}
                                    busy={busy}
                                    style={{ height: 40, paddingHorizontal: spacing.lg }}
                                />
                            </View>
                        ) : (
                            <View style={styles.premiumBadge}>
                                <Ionicons name="star" size={14} color={colors.warning} />
                                <Text style={styles.premiumBadgeText} allowFontScaling={false}>
                                    Premium unlocked for this season
                                </Text>
                            </View>
                        )}

                        {showXpBoost ? (
                            <View style={styles.xpBoostCard}>
                                <View style={styles.upgradeTextWrap}>
                                    <Text style={styles.xpBoostTitle} allowFontScaling={false}>
                                        XP Boost
                                    </Text>
                                    <Text style={styles.upgradeSub} allowFontScaling={false}>
                                        Watch a short ad → +50 XP
                                        {`  ·  ${xpBoostsRemaining} / ${xpBoostLimit} left today`}
                                    </Text>
                                </View>
                                <Button
                                    label="Watch"
                                    onPress={onWatchXpBoost}
                                    busy={adBusy}
                                    variant="secondary"
                                    style={{ height: 40, paddingHorizontal: spacing.lg }}
                                />
                            </View>
                        ) : null}
                    </View>
                }
                renderItem={({ item: tier }) => {
                    const rewardsForTier = byTier[tier]!;
                    const free = rewardsForTier.find((r) => r.track === 'free');
                    const premium = rewardsForTier.find((r) => r.track === 'premium');
                    return (
                        <View style={styles.tierRow}>
                            <Text style={styles.tierNum} allowFontScaling={false}>
                                {tier}
                            </Text>
                            <RewardCell
                                reward={free}
                                track="free"
                                premiumOwned={you.premium}
                                claiming={claimingKey === (free ? `${free.tier}:free` : '')}
                                onClaim={onClaim}
                            />
                            <RewardCell
                                reward={premium}
                                track="premium"
                                premiumOwned={you.premium}
                                claiming={claimingKey === (premium ? `${premium.tier}:premium` : '')}
                                onClaim={onClaim}
                            />
                        </View>
                    );
                }}
            />
        </SafeAreaView>
    );
}

function RewardCell({
    reward,
    track,
    premiumOwned,
    claiming,
    onClaim,
}: {
    reward: BattlePassRewardView | undefined;
    track: 'free' | 'premium';
    premiumOwned: boolean;
    claiming: boolean;
    onClaim: (r: BattlePassRewardView) => void;
}) {
    if (!reward) {
        return (
            <View style={[styles.cell, styles.cellEmpty]}>
                <Text style={styles.cellEmptyLabel} allowFontScaling={false}>
                    —
                </Text>
            </View>
        );
    }
    const claimable =
        reward.unlocked &&
        !reward.claimed &&
        reward.cosmeticId !== null &&
        (track === 'free' || premiumOwned);
    return (
        <Pressable
            onPress={() => claimable && onClaim(reward)}
            disabled={!claimable || claiming}
            style={[
                styles.cell,
                track === 'premium' ? styles.cellPremium : null,
                reward.claimed ? styles.cellClaimed : null,
                !reward.unlocked ? styles.cellLocked : null,
            ]}
        >
            <Text style={styles.cellTrackLabel} allowFontScaling={false}>
                {track === 'premium' ? 'PREMIUM' : 'FREE'}
            </Text>
            <Text style={styles.cellId} allowFontScaling={false}>
                {reward.cosmeticId ?? 'XP'}
            </Text>
            <Text
                style={[
                    styles.cellStatus,
                    reward.claimed ? { color: colors.primary } : null,
                ]}
                allowFontScaling={false}
            >
                {reward.claimed
                    ? 'OWNED'
                    : claimable
                    ? claiming
                        ? '…'
                        : 'CLAIM'
                    : reward.unlocked
                    ? track === 'premium' && !premiumOwned
                        ? 'PREMIUM'
                        : 'LOCKED'
                    : 'LOCKED'}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
    empty: {
        textAlign: 'center',
        color: colors.textDim,
        marginTop: spacing.xxl,
    },
    header: { paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xs },
    title: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.bold,
    },
    subtitle: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        marginBottom: spacing.sm,
    },
    progressTrack: {
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    progressFill: { height: '100%', backgroundColor: colors.primary },
    progressLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        fontFamily: typography.familyMono,
    },
    upgradeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.lg,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.warning,
    },
    xpBoostCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    xpBoostTitle: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    upgradeTextWrap: { flex: 1, gap: spacing.xs },
    upgradeTitle: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    upgradeSub: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
    },
    premiumBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: spacing.lg,
    },
    premiumBadgeText: { color: colors.warning, fontSize: typography.sizes.sm },
    tierRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: spacing.sm,
        marginTop: spacing.sm,
    },
    tierNum: {
        width: 32,
        textAlign: 'center',
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        alignSelf: 'center',
    },
    cell: {
        flex: 1,
        backgroundColor: colors.surface,
        padding: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 2,
    },
    cellPremium: { borderColor: colors.warning },
    cellEmpty: {
        backgroundColor: 'transparent',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cellEmptyLabel: { color: colors.textMuted },
    cellClaimed: { borderColor: colors.primary },
    cellLocked: { opacity: 0.5 },
    cellTrackLabel: {
        fontSize: 10,
        letterSpacing: 1,
        color: colors.textDim,
        fontWeight: typography.weights.bold,
    },
    cellId: {
        color: colors.text,
        fontSize: typography.sizes.xs,
    },
    cellStatus: {
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
        color: colors.textDim,
        marginTop: spacing.xs,
    },
});
