// Cosmetics shop. Items are grouped by category. Purchase grants the
// cosmetic; "Equip" calls PATCH /me/equip. Prices come from the store
// (localized) once the product catalog loads, falling back to the server's
// USD reference price until then. Purchases go through StoreKit / Play Billing.
//
// Note: the brief is explicit that power-ups are NEVER sold here. Power-ups
// are earned through play. This screen is cosmetics only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
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
import { EquipTransition, type EquipTarget } from '../../src/components/ui/EquipTransition';
import { useAuthStore } from '../../src/store/authStore';
import { adsApi, boostsApi, coinsApi, cosmeticsApi, usersApi } from '../../src/api/resources';
import {
    cosmeticProductId,
    iapAvailable,
    IapCancelled,
    loadProducts,
    purchaseCoinPack,
    purchaseCosmetic,
    purchaseRemoveAds,
    purchaseStarterBundle,
    REMOVE_ADS_PRODUCT_ID,
    restorePurchases,
    STARTER_BUNDLE_PRODUCT_ID,
    storePrice,
} from '../../src/iap';
import { adsAvailable, preloadRewarded, showRewarded } from '../../src/ads';
import { AdLoadingOverlay } from '../../src/components/ui/AdLoadingOverlay';
import type { CoinPack, Cosmetic, CosmeticCategory, StarterBundle } from '../../src/types/index';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';
import { contentColumn } from '../../src/theme/layout';

const CATEGORY_ORDER: CosmeticCategory[] = [
    'board_theme',
    'victory_anim',
    'avatar',
    'nameplate',
    'profile_border',
];
const CATEGORY_TITLE: Record<CosmeticCategory, string> = {
    board_theme: 'Board themes',
    victory_anim: 'Victory animations',
    avatar: 'Avatars',
    nameplate: 'Nameplates',
    profile_border: 'Profile borders',
};

// Read at render time so rarity colors track the active theme (a module-level
// const would freeze to whatever theme was loaded first).
function rarityColor(rarity: Cosmetic['rarity']): string {
    switch (rarity) {
        case 'rare':
            return colors.info;
        case 'epic':
            return '#C490FF';
        case 'legendary':
            return colors.warning;
        case 'common':
        default:
            return colors.textDim;
    }
}

export default function Shop() {
    const user = useAuthStore((s) => s.user);
    const refreshMe = useAuthStore((s) => s.refreshMe);
    const [items, setItems] = useState<Cosmetic[]>([]);
    const [packs, setPacks] = useState<CoinPack[]>([]);
    const [bundle, setBundle] = useState<StarterBundle | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [packBusyId, setPackBusyId] = useState<string | null>(null);
    const [removeAdsBusy, setRemoveAdsBusy] = useState(false);
    const [bundleBusy, setBundleBusy] = useState(false);
    const [boostBusy, setBoostBusy] = useState<'shield' | 'xp' | null>(null);
    const [adBusy, setAdBusy] = useState(false);
    // Bumped once the store catalog (localized prices) has loaded.
    const [, setPricesLoaded] = useState(0);
    // Drives the "before → after" equip reveal overlay.
    const [equipReveal, setEquipReveal] = useState<{
        category: CosmeticCategory;
        from: EquipTarget | null;
        to: EquipTarget;
    } | null>(null);

    const load = useCallback(async () => {
        try {
            const [shopRes, packsRes] = await Promise.all([
                cosmeticsApi.list(),
                coinsApi.listPacks(),
            ]);
            setItems(shopRes.cosmetics);
            setPacks(packsRes.packs);
            setBundle(packsRes.starterBundle ?? null);
            // Localized prices from the store for everything on this screen.
            const skus = [
                REMOVE_ADS_PRODUCT_ID,
                STARTER_BUNDLE_PRODUCT_ID,
                ...packsRes.packs.map((p) => p.productId),
                ...shopRes.cosmetics
                    .filter((c) => c.priceCents > 0)
                    .map((c) => cosmeticProductId(c.id)),
            ];
            loadProducts(skus).then(() => setPricesLoaded((n) => n + 1));
        } catch (err) {
            Alert.alert('Could not load shop', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    useEffect(() => {
        load();
    }, [load]);

    const grouped = useMemo(() => {
        const out: { category: CosmeticCategory; items: Cosmetic[] }[] = [];
        for (const cat of CATEGORY_ORDER) {
            const subset = items.filter((c) => c.category === cat);
            if (subset.length > 0) out.push({ category: cat, items: subset });
        }
        return out;
    }, [items]);

    // Currently-equipped cosmetic id for a category (the "before" of a reveal).
    function equippedIdFor(cat: CosmeticCategory): string | null {
        if (!user || !('equipped' in user) || !user.equipped) return null;
        const e = user.equipped;
        switch (cat) {
            case 'board_theme':
                return e.boardTheme;
            case 'victory_anim':
                return e.victoryAnim;
            case 'avatar':
                return e.avatar;
            case 'nameplate':
                return e.nameplate;
            case 'profile_border':
                return e.profileBorder;
        }
    }
    function renderDataFor(id: string | null): Record<string, unknown> | null {
        if (!id) return null;
        return items.find((i) => i.id === id)?.renderData ?? null;
    }
    function showEquipReveal(c: Cosmetic, fromId: string | null) {
        setEquipReveal({
            category: c.category,
            from:
                fromId && fromId !== c.id
                    ? { id: fromId, renderData: renderDataFor(fromId) }
                    : null,
            to: { id: c.id, name: c.name, renderData: c.renderData },
        });
    }

    async function onPurchase(c: Cosmetic) {
        const fromId = equippedIdFor(c.category);
        setBusyId(c.id);
        let equipOk = false;
        try {
            await purchaseCosmetic(c.id);
            // Auto-equip the just-purchased cosmetic. UX: you bought it,
            // you almost certainly want to use it right away. Players were
            // confused that "Buy" didn't visually do anything.
            try {
                await usersApi.equip(c.category, c.id);
                equipOk = true;
            } catch (equipErr) {
                // Non-fatal — the cosmetic is still purchased, user can
                // tap Equip manually.
                console.warn('auto-equip after purchase failed', equipErr);
            }
            // Refresh both the shop catalog (now owned=true) and /me (now
            // equipped). Without both, the UI doesn't reflect the change.
            await Promise.all([load(), refreshMe()]);
            if (equipOk) showEquipReveal(c, fromId);
        } catch (err) {
            if (!(err instanceof IapCancelled)) {
                Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Try again.');
            }
        } finally {
            setBusyId(null);
        }
    }

    /** Buy a cosmetic with coins (the no-cash path). */
    async function onPurchaseCoins(c: Cosmetic) {
        const coins = user && 'coins' in user ? user.coins : 0;
        if (coins < c.priceCoins) {
            Alert.alert(
                'Not enough coins',
                `${c.name} costs ${c.priceCoins.toLocaleString()} coins and you have ${coins.toLocaleString()}. Win matches, watch a coin ad, or grab a coin pack.`
            );
            return;
        }
        Alert.alert(c.name, `Buy for ${c.priceCoins.toLocaleString()} coins?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Buy',
                onPress: async () => {
                    const fromId = equippedIdFor(c.category);
                    setBusyId(c.id);
                    try {
                        await cosmeticsApi.purchaseWithCoins(c.id);
                        let equipOk = false;
                        try {
                            await usersApi.equip(c.category, c.id);
                            equipOk = true;
                        } catch {
                            /* purchased; user can equip manually */
                        }
                        await Promise.all([load(), refreshMe()]);
                        if (equipOk) showEquipReveal(c, fromId);
                    } catch (err) {
                        Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Try again.');
                    } finally {
                        setBusyId(null);
                    }
                },
            },
        ]);
    }

    async function onStarterBundle() {
        if (!bundle) return;
        setBundleBusy(true);
        try {
            await purchaseStarterBundle();
            await Promise.all([load(), refreshMe()]);
            Alert.alert('Welcome aboard!', `+${bundle.coins} coins, Fox avatar and Neon Pulse theme are yours.`);
        } catch (err) {
            if (!(err instanceof IapCancelled)) {
                Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Try again.');
            }
        } finally {
            setBundleBusy(false);
        }
    }

    async function onBuyShield() {
        setBoostBusy('shield');
        try {
            await boostsApi.buyStreakShield();
            await refreshMe();
        } catch (err) {
            Alert.alert('Could not buy shield', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setBoostBusy(null);
        }
    }

    async function onBuyXpBoost() {
        setBoostBusy('xp');
        try {
            await boostsApi.buyXpBoost();
            await refreshMe();
        } catch (err) {
            Alert.alert('Could not buy booster', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setBoostBusy(null);
        }
    }

    async function onWatchCoinAd() {
        if (!user) return;
        setAdBusy(true);
        try {
            const r = await showRewarded('coin_boost', user.id);
            if (r.unavailable) {
                Alert.alert('Ads not available', 'Coin ads need the production / dev-client build (not Expo Go).');
                return;
            }
            if (r.earned) {
                try {
                    await adsApi.devClaimReward('coin_boost');
                } catch {
                    /* prod 404 / cap 409 — SSV grants it */
                }
                setTimeout(() => refreshMe().catch(() => {}), 1200);
                Alert.alert('+25 coins incoming', 'Updating your balance…');
            } else if (r.error) {
                Alert.alert('Ad error', r.error);
            }
        } finally {
            setAdBusy(false);
        }
    }

    async function onEquip(c: Cosmetic) {
        const fromId = equippedIdFor(c.category);
        setBusyId(c.id);
        try {
            await usersApi.equip(c.category, c.id);
            await refreshMe();
            // Also reload shop so equipped state on cards updates immediately.
            await load();
            showEquipReveal(c, fromId);
        } catch (err) {
            Alert.alert('Equip failed', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setBusyId(null);
        }
    }

    // In a real build the native store sheet handles confirmation + price, so we
    // trigger it directly. In Expo Go / simulator (no native store) we keep an
    // explicit confirm since the server grants directly in dev.
    const devNote = iapAvailable()
        ? ''
        : '\n\n(Dev build: no native store — the server grants directly.)';

    const removeAdsPrice = storePrice(REMOVE_ADS_PRODUCT_ID) ?? '$4.99';

    async function onRemoveAds() {
        Alert.alert(
            'Remove Ads',
            `One-time ${removeAdsPrice} — removes all interstitial and banner ads forever. Rewarded ads (Daily Bonus, XP Boost) stay available since they're opt-in.` +
                devNote,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Buy',
                    onPress: async () => {
                        setRemoveAdsBusy(true);
                        try {
                            await purchaseRemoveAds();
                            await refreshMe();
                        } catch (err) {
                            if (!(err instanceof IapCancelled)) {
                                Alert.alert('Purchase failed', err instanceof Error ? err.message : '');
                            }
                        } finally {
                            setRemoveAdsBusy(false);
                        }
                    },
                },
            ]
        );
    }

    const adsRemoved = user && 'ads' in user ? user.ads.removed : false;
    const coins = user && 'coins' in user ? user.coins : 0;
    const shields = user && 'boosts' in user ? user.boosts.streakShields : 0;
    const shieldMax = user && 'boosts' in user ? user.boosts.streakShieldMax : 2;
    const xpBoostUntil = user && 'boosts' in user ? user.boosts.xpBoostUntil : null;
    const xpBoostActive = !!xpBoostUntil && new Date(xpBoostUntil).getTime() > Date.now();
    const starterOwned = user && 'bundles' in user ? user.bundles.starterOwned : true;
    const coinAdsLeft =
        user && 'ads' in user ? Math.max(0, user.ads.coinAdsDailyLimit - user.ads.coinAdsToday) : 0;
    // Rewarded ads are opt-in, so they stay available even after Remove Ads.
    const showCoinAd = adsAvailable() && coinAdsLeft > 0;
    const userId = user?.id;
    useEffect(() => {
        if (showCoinAd && userId) preloadRewarded('coin_boost', userId);
    }, [showCoinAd, userId]);
    const bundlePrice = bundle ? storePrice(STARTER_BUNDLE_PRODUCT_ID) ?? `$${bundle.priceUsd.toFixed(2)}` : '';

    async function onPackPurchase(pack: CoinPack) {
        Alert.alert(
            pack.name,
            `${pack.coins.toLocaleString()} coins for ${packPrice(pack)}.` + devNote,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Buy',
                    onPress: async () => {
                        setPackBusyId(pack.id);
                        try {
                            await purchaseCoinPack(pack.id);
                            await refreshMe();
                            Alert.alert('Coins added', `+${pack.coins.toLocaleString()} coins`);
                        } catch (err) {
                            if (!(err instanceof IapCancelled)) {
                                Alert.alert(
                                    'Purchase failed',
                                    err instanceof Error ? err.message : 'Try again.'
                                );
                            }
                        } finally {
                            setPackBusyId(null);
                        }
                    },
                },
            ]
        );
    }

    const [restoring, setRestoring] = useState(false);
    async function onRestore() {
        setRestoring(true);
        try {
            const n = await restorePurchases();
            await Promise.all([load(), refreshMe()]);
            Alert.alert(
                'Restore complete',
                n > 0
                    ? `Restored ${n} purchase${n === 1 ? '' : 's'}.`
                    : 'No previous purchases to restore.'
            );
        } catch (err) {
            Alert.alert('Restore failed', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setRestoring(false);
        }
    }

    function isEquipped(c: Cosmetic): boolean {
        if (!user || !('equipped' in user) || !user.equipped) return false;
        const e = user.equipped;
        switch (c.category) {
            case 'board_theme':
                return e.boardTheme === c.id;
            case 'victory_anim':
                return e.victoryAnim === c.id;
            case 'avatar':
                return e.avatar === c.id;
            case 'nameplate':
                return e.nameplate === c.id;
            case 'profile_border':
                return e.profileBorder === c.id;
        }
    }

    return (
        <SafeAreaView style={styles.safe}>
            <AdLoadingOverlay visible={adBusy} label="Loading coin ad…" />
            <EquipTransition
                visible={!!equipReveal}
                category={equipReveal?.category ?? null}
                from={equipReveal?.from ?? null}
                to={equipReveal?.to ?? null}
                onDone={() => setEquipReveal(null)}
            />
            <View style={styles.header}>
                <Text style={styles.title} allowFontScaling={false}>Shop</Text>
                <Text style={styles.subtitle} allowFontScaling={false}>
                    Cosmetic only. Power-ups are earned through play.
                </Text>
            </View>
            <FlatList
                data={grouped}
                keyExtractor={(g) => g.category}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <View>
                        {bundle && !starterOwned ? (
                            <View style={styles.bundleCard}>
                                <View style={styles.bundleHead}>
                                    <Ionicons name="gift" size={22} color={colors.primary} />
                                    <Text style={styles.bundleTitle} allowFontScaling={false}>
                                        {bundle.name}
                                    </Text>
                                    <View style={styles.bestValueBadge}>
                                        <Text style={styles.bestValueText} allowFontScaling={false}>
                                            ONE TIME
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.bundleSub} allowFontScaling={false}>
                                    {bundle.description}
                                </Text>
                                <Button
                                    label={`Get it for ${bundlePrice}`}
                                    onPress={onStarterBundle}
                                    busy={bundleBusy}
                                    style={{ height: 44, marginTop: spacing.sm }}
                                />
                            </View>
                        ) : null}

                        <View style={styles.removeAdsCard}>
                            <View style={styles.removeAdsLeft}>
                                <Ionicons
                                    name={adsRemoved ? 'checkmark-circle' : 'shield-checkmark'}
                                    size={24}
                                    color={adsRemoved ? colors.primary : colors.warning}
                                />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.removeAdsTitle} allowFontScaling={false}>
                                        {adsRemoved ? 'Ads Removed' : 'Remove Ads'}
                                    </Text>
                                    <Text style={styles.removeAdsSub} allowFontScaling={false}>
                                        {adsRemoved
                                            ? 'No interstitials. Thanks for supporting the game!'
                                            : `${removeAdsPrice} one-time. No more interstitial or banner ads, ever.`}
                                    </Text>
                                </View>
                            </View>
                            {!adsRemoved ? (
                                <Button
                                    label={`Buy ${removeAdsPrice}`}
                                    onPress={onRemoveAds}
                                    busy={removeAdsBusy}
                                    style={{ height: 40, paddingHorizontal: spacing.lg }}
                                />
                            ) : null}
                        </View>

                        {packs.length > 0 ? (
                            <View style={styles.coinSection}>
                                <View style={styles.coinHeader}>
                                    <Ionicons
                                        name="logo-bitcoin"
                                        size={18}
                                        color={colors.warning}
                                    />
                                    <Text
                                        style={styles.coinHeaderTitle}
                                        allowFontScaling={false}
                                    >
                                        Coin Packs
                                    </Text>
                                </View>
                                <Text style={styles.coinHeaderSub} allowFontScaling={false}>
                                    Spend on hints (50 coins each) and future
                                    consumables. Earned by playing too — no need
                                    to buy.
                                </Text>
                                {showCoinAd ? (
                                    <View style={styles.boostCard}>
                                        <Ionicons name="play-circle" size={22} color={colors.warning} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.boostTitle} allowFontScaling={false}>
                                                Free coins
                                            </Text>
                                            <Text style={styles.boostSub} allowFontScaling={false}>
                                                Watch a short ad → +25 coins · {coinAdsLeft} left today
                                            </Text>
                                        </View>
                                        <Button
                                            label="Watch"
                                            onPress={onWatchCoinAd}
                                            busy={adBusy}
                                            variant="secondary"
                                            style={{ height: 40, paddingHorizontal: spacing.md }}
                                        />
                                    </View>
                                ) : null}
                                {packs.map((pack) => (
                                    <CoinPackCard
                                        key={pack.id}
                                        pack={pack}
                                        busy={packBusyId === pack.id}
                                        onPress={() => onPackPurchase(pack)}
                                    />
                                ))}
                            </View>
                        ) : null}

                        {/* Boosts — coin sinks that never touch match fairness. */}
                        <View style={styles.coinSection}>
                            <View style={styles.coinHeader}>
                                <Ionicons name="rocket" size={18} color={colors.info} />
                                <Text style={styles.coinHeaderTitle} allowFontScaling={false}>
                                    Boosts
                                </Text>
                                <Text style={styles.balance} allowFontScaling={false}>
                                    {coins.toLocaleString()} coins
                                </Text>
                            </View>
                            <View style={styles.boostCard}>
                                <Ionicons name="shield-half" size={22} color={colors.primary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.boostTitle} allowFontScaling={false}>
                                        Streak Shield · {shields}/{shieldMax} held
                                    </Text>
                                    <Text style={styles.boostSub} allowFontScaling={false}>
                                        Miss a day and keep your play streak. One shield covers one day.
                                    </Text>
                                </View>
                                <Button
                                    label={shields >= shieldMax ? 'Max' : '150 coins'}
                                    onPress={onBuyShield}
                                    busy={boostBusy === 'shield'}
                                    disabled={shields >= shieldMax}
                                    variant="secondary"
                                    style={{ height: 40, paddingHorizontal: spacing.md }}
                                />
                            </View>
                            <View style={styles.boostCard}>
                                <Ionicons name="flash" size={22} color={colors.warning} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.boostTitle} allowFontScaling={false}>
                                        XP Booster
                                    </Text>
                                    <Text style={styles.boostSub} allowFontScaling={false}>
                                        {xpBoostActive
                                            ? `2× match XP active · ends in ${timeLeft(xpBoostUntil!)}`
                                            : '2× battle-pass XP from matches for 24 hours.'}
                                    </Text>
                                </View>
                                <Button
                                    label={xpBoostActive ? '+24h · 250' : '250 coins'}
                                    onPress={onBuyXpBoost}
                                    busy={boostBusy === 'xp'}
                                    variant="secondary"
                                    style={{ height: 40, paddingHorizontal: spacing.md }}
                                />
                            </View>
                        </View>
                    </View>
                }
                renderItem={({ item: group }) => (
                    <View style={styles.group}>
                        <Text style={styles.groupTitle} allowFontScaling={false}>
                            {CATEGORY_TITLE[group.category]}
                        </Text>
                        <View style={styles.itemsWrap}>
                            {group.items.map((c) => (
                                <ShopItem
                                    key={c.id}
                                    cosmetic={c}
                                    equipped={isEquipped(c)}
                                    busy={busyId === c.id}
                                    onPurchase={() => onPurchase(c)}
                                    onPurchaseCoins={() => onPurchaseCoins(c)}
                                    onEquip={() => onEquip(c)}
                                />
                            ))}
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    !loading ? (
                        <Text style={styles.empty} allowFontScaling={false}>
                            No cosmetics available.
                        </Text>
                    ) : null
                }
                ListFooterComponent={
                    <Pressable
                        onPress={onRestore}
                        disabled={restoring}
                        accessibilityRole="button"
                        accessibilityLabel="Restore purchases"
                        style={({ pressed }) => [
                            styles.restoreBtn,
                            pressed ? { opacity: 0.7 } : null,
                        ]}
                    >
                        {restoring ? (
                            <ActivityIndicator size="small" color={colors.textDim} />
                        ) : (
                            <Text style={styles.restoreText} allowFontScaling={false}>
                                Restore Purchases
                            </Text>
                        )}
                    </Pressable>
                }
            />
        </SafeAreaView>
    );
}

/** Store-localized price for a coin pack, else the server's USD reference. */
function packPrice(pack: CoinPack): string {
    return storePrice(pack.productId) ?? `$${pack.priceUsd.toFixed(2)}`;
}

/** "5h 12m" style countdown to an ISO time. */
function timeLeft(iso: string): string {
    const ms = Math.max(0, new Date(iso).getTime() - Date.now());
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ShopItem({
    cosmetic,
    equipped,
    busy,
    onPurchase,
    onPurchaseCoins,
    onEquip,
}: {
    cosmetic: Cosmetic;
    equipped: boolean;
    busy: boolean;
    onPurchase: () => void;
    onPurchaseCoins: () => void;
    onEquip: () => void;
}) {
    const priceLabel =
        cosmetic.priceCents === 0
            ? 'Free'
            : storePrice(cosmeticProductId(cosmetic.id)) ??
              `$${(cosmetic.priceCents / 100).toFixed(2)}`;
    const action = cosmetic.owned
        ? equipped
            ? 'EQUIPPED'
            : 'EQUIP'
        : 'BUY';
    const onPress = cosmetic.owned ? (equipped ? () => {} : onEquip) : onPurchase;

    return (
        <View style={styles.itemCard}>
            <View
                style={[styles.preview, swatchStyle(cosmetic)]}
            />
            <View style={styles.itemBody}>
                <View style={styles.itemHeader}>
                    <Text style={styles.itemName} allowFontScaling={false}>
                        {cosmetic.name}
                    </Text>
                    <Text
                        style={[styles.rarity, { color: rarityColor(cosmetic.rarity) }]}
                        allowFontScaling={false}
                    >
                        {cosmetic.rarity.toUpperCase()}
                    </Text>
                </View>
                {cosmetic.description ? (
                    <Text style={styles.itemDesc} allowFontScaling={false}>
                        {cosmetic.description}
                    </Text>
                ) : null}
                <View style={styles.itemFooter}>
                    {!cosmetic.owned && cosmetic.priceCoins > 0 ? (
                        <Pressable
                            onPress={onPurchaseCoins}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel={`Buy ${cosmetic.name} for ${cosmetic.priceCoins} coins`}
                            style={({ pressed }) => [styles.coinBtn, pressed ? { opacity: 0.85 } : null]}
                        >
                            <Ionicons name="ellipse" size={11} color={colors.warning} />
                            <Text style={styles.coinBtnText} allowFontScaling={false}>
                                {cosmetic.priceCoins.toLocaleString()}
                            </Text>
                        </Pressable>
                    ) : (
                        <Text style={styles.price} allowFontScaling={false}>
                            {cosmetic.owned ? '' : priceLabel}
                        </Text>
                    )}
                    <Pressable
                        onPress={onPress}
                        disabled={busy || equipped}
                        accessibilityRole="button"
                        accessibilityLabel={`${action.toLowerCase()} ${cosmetic.name}`}
                        accessibilityState={{ disabled: busy || equipped, busy }}
                        style={({ pressed }) => [
                            styles.actionBtn,
                            equipped ? styles.actionEquipped : null,
                            !equipped && cosmetic.owned ? styles.actionEquip : null,
                            !cosmetic.owned ? styles.actionBuy : null,
                            pressed ? { opacity: 0.85 } : null,
                            busy ? { opacity: 0.7 } : null,
                        ]}
                    >
                        {busy ? (
                            <ActivityIndicator
                                size="small"
                                color={equipped ? colors.primary : colors.text}
                            />
                        ) : (
                            <Text
                                style={[
                                    styles.actionLabel,
                                    equipped ? { color: colors.primary } : null,
                                ]}
                                allowFontScaling={false}
                            >
                                {action === 'BUY' ? `BUY ${priceLabel}` : action}
                            </Text>
                        )}
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

function CoinPackCard({
    pack,
    busy,
    onPress,
}: {
    pack: CoinPack;
    busy: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Buy ${pack.name}, ${pack.coins} coins for ${packPrice(pack)}`}
            accessibilityState={{ disabled: busy, busy }}
            style={({ pressed }) => [
                styles.packCard,
                pack.featured ? styles.packCardFeatured : null,
                pressed && !busy ? { opacity: 0.85 } : null,
                busy ? { opacity: 0.5 } : null,
            ]}
        >
            <View style={styles.packIcon}>
                <Ionicons
                    name="logo-bitcoin"
                    size={24}
                    color={pack.featured ? colors.warning : colors.text}
                />
            </View>
            <View style={styles.packBody}>
                <View style={styles.packHeader}>
                    <Text style={styles.packName} allowFontScaling={false}>
                        {pack.name}
                    </Text>
                    {pack.bonusPct ? (
                        <View
                            style={[
                                styles.bonusBadge,
                                pack.featured ? styles.bonusBadgeFeatured : null,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.bonusBadgeText,
                                    pack.featured ? { color: '#0F1115' } : null,
                                ]}
                                allowFontScaling={false}
                            >
                                +{pack.bonusPct}%
                            </Text>
                        </View>
                    ) : null}
                    {pack.featured ? (
                        <View style={styles.bestValueBadge}>
                            <Text style={styles.bestValueText} allowFontScaling={false}>
                                BEST VALUE
                            </Text>
                        </View>
                    ) : null}
                </View>
                <Text style={styles.packCoins} allowFontScaling={false}>
                    {pack.coins.toLocaleString()} coins
                </Text>
                <Text style={styles.packDesc} allowFontScaling={false}>
                    {pack.description}
                </Text>
            </View>
            <View style={styles.packPriceWrap}>
                <Text style={styles.packPrice} allowFontScaling={false}>
                    {packPrice(pack)}
                </Text>
                <Text style={styles.packBuyHint} allowFontScaling={false}>
                    TAP TO BUY
                </Text>
            </View>
        </Pressable>
    );
}

/** Render a small preview swatch from the cosmetic's render_data. */
function swatchStyle(c: Cosmetic): { backgroundColor: string } {
    const data = c.renderData ?? {};
    if (c.category === 'board_theme') {
        return { backgroundColor: (data['bg'] as string) ?? colors.surfaceElevated };
    }
    if (c.category === 'avatar') {
        return { backgroundColor: (data['color'] as string) ?? colors.textDim };
    }
    if (c.category === 'nameplate') {
        return { backgroundColor: (data['color'] as string) ?? colors.surfaceElevated };
    }
    if (c.category === 'profile_border') {
        return { backgroundColor: (data['color'] as string) ?? colors.surfaceElevated };
    }
    return { backgroundColor: colors.surfaceElevated };
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { ...contentColumn, backgroundColor: colors.bg },
    listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
    header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
    title: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.bold,
    },
    subtitle: {
        fontFamily: typography.family,
        color: colors.textDim,
        marginTop: spacing.xs,
        fontSize: typography.sizes.sm,
    },
    group: { marginTop: spacing.lg, gap: spacing.sm },
    groupTitle: {
        fontFamily: typography.familyDisplay,
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    itemsWrap: { gap: spacing.sm },
    itemCard: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    preview: {
        width: 80,
    },
    itemBody: {
        flex: 1,
        padding: spacing.md,
        gap: spacing.xs,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemName: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
    },
    rarity: {
        fontFamily: typography.familyDisplay,
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: typography.weights.bold,
    },
    itemDesc: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.sm,
    },
    itemFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacing.xs,
    },
    price: {
        color: colors.text,
        fontFamily: typography.familyMono,
        fontWeight: typography.weights.bold,
    },
    actionBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        minWidth: 88,
        alignItems: 'center',
    },
    actionBuy: { backgroundColor: colors.primary },
    // EQUIP is the clear call-to-action → filled green (dark label), like BUY.
    actionEquip: { backgroundColor: colors.primary },
    // EQUIPPED is a "done/selected" state → muted outline (green label).
    actionEquipped: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
    actionLabel: {
        fontFamily: typography.familyDisplay,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.black,
        letterSpacing: 1,
        // Dark label reads on the filled green BUY/EQUIP buttons. The equipped
        // state overrides this to the primary color inline (green on outline).
        color: colors.bg,
    },
    empty: {
        textAlign: 'center',
        color: colors.textDim,
        marginTop: spacing.xl,
    },
    restoreBtn: {
        marginTop: spacing.xl,
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
    restoreText: {
        fontFamily: typography.familyMono,
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        textDecorationLine: 'underline',
    },
    bundleCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.primary,
        marginTop: spacing.lg,
        gap: spacing.xs,
    },
    bundleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bundleTitle: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
        flex: 1,
    },
    bundleSub: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        lineHeight: 17,
    },
    boostCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
    },
    boostTitle: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
    },
    boostSub: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        marginTop: 2,
    },
    balance: {
        marginLeft: 'auto',
        fontFamily: typography.familyMono,
        color: colors.warning,
        fontSize: typography.sizes.xs,
    },
    coinBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.warning,
    },
    coinBtnText: {
        fontFamily: typography.familyMonoBold,
        color: colors.warning,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
    },
    removeAdsCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.warning,
        marginTop: spacing.lg,
        gap: spacing.md,
    },
    removeAdsLeft: {
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'center',
        flex: 1,
    },
    removeAdsTitle: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    removeAdsSub: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        marginTop: spacing.xs,
    },
    coinSection: {
        marginTop: spacing.lg,
        gap: spacing.sm,
    },
    coinHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    coinHeaderTitle: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    coinHeaderSub: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        marginBottom: spacing.xs,
    },
    packCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.md,
    },
    packCardFeatured: {
        borderColor: colors.warning,
    },
    packIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
    },
    packBody: {
        flex: 1,
        gap: 2,
    },
    packHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
    },
    packName: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    bonusBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
    },
    bonusBadgeFeatured: {
        backgroundColor: colors.warning,
        borderColor: colors.warning,
    },
    bonusBadgeText: {
        fontFamily: typography.familyDisplay,
        color: colors.textDim,
        fontSize: 10,
        fontWeight: typography.weights.bold,
        letterSpacing: 0.5,
    },
    bestValueBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: radius.sm,
        backgroundColor: colors.primary,
    },
    bestValueText: {
        fontFamily: typography.familyDisplay,
        color: '#0F1115',
        fontSize: 10,
        fontWeight: typography.weights.bold,
        letterSpacing: 0.5,
    },
    packCoins: {
        color: colors.warning,
        fontSize: typography.sizes.sm,
        fontFamily: typography.familyMono,
        fontWeight: typography.weights.bold,
    },
    packDesc: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.xs,
    },
    packPriceWrap: {
        alignItems: 'flex-end',
        gap: 2,
    },
    packPrice: {
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        fontFamily: typography.familyMono,
    },
    packBuyHint: {
        fontFamily: typography.familyDisplay,
        color: colors.textMuted,
        fontSize: 9,
        letterSpacing: 1,
        fontWeight: typography.weights.bold,
    },
}));
