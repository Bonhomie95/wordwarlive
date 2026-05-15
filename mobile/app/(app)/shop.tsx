// Cosmetics shop. Items are grouped by category. Purchase grants the
// cosmetic; "Equip" calls PATCH /me/equip. Prices show in USD; in production
// this would route through StoreKit / Play Billing.
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
import { useAuthStore } from '../../src/store/authStore';
import { adsApi, coinsApi, cosmeticsApi, usersApi } from '../../src/api/resources';
import type { CoinPack, Cosmetic, CosmeticCategory } from '../../src/types/index';
import { colors } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

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

const RARITY_COLOR: Record<Cosmetic['rarity'], string> = {
    common: colors.textDim,
    rare: colors.info,
    epic: '#C490FF',
    legendary: colors.warning,
};

export default function Shop() {
    const user = useAuthStore((s) => s.user);
    const refreshMe = useAuthStore((s) => s.refreshMe);
    const [items, setItems] = useState<Cosmetic[]>([]);
    const [packs, setPacks] = useState<CoinPack[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [packBusyId, setPackBusyId] = useState<string | null>(null);
    const [removeAdsBusy, setRemoveAdsBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [shopRes, packsRes] = await Promise.all([
                cosmeticsApi.list(),
                coinsApi.listPacks(),
            ]);
            setItems(shopRes.cosmetics);
            setPacks(packsRes.packs);
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

    async function onPurchase(c: Cosmetic) {
        setBusyId(c.id);
        try {
            await cosmeticsApi.purchase(c.id);
            // Auto-equip the just-purchased cosmetic. UX: you bought it,
            // you almost certainly want to use it right away. Players were
            // confused that "Buy" didn't visually do anything.
            try {
                await usersApi.equip(c.category, c.id);
            } catch (equipErr) {
                // Non-fatal — the cosmetic is still purchased, user can
                // tap Equip manually.
                // eslint-disable-next-line no-console
                console.warn('auto-equip after purchase failed', equipErr);
            }
            // Refresh both the shop catalog (now owned=true) and /me (now
            // equipped). Without both, the UI doesn't reflect the change.
            await Promise.all([load(), refreshMe()]);
        } catch (err) {
            Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setBusyId(null);
        }
    }

    async function onEquip(c: Cosmetic) {
        setBusyId(c.id);
        try {
            await usersApi.equip(c.category, c.id);
            await refreshMe();
            // Also reload shop so equipped state on cards updates immediately.
            await load();
        } catch (err) {
            Alert.alert('Equip failed', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setBusyId(null);
        }
    }

    async function onRemoveAds() {
        Alert.alert(
            'Remove Ads',
            'One-time $4.99 — removes all interstitial ads forever. Rewarded ads (Daily Bonus, XP Boost) stay available since they\'re opt-in.\n\n(Receipt verification is stubbed in dev — production routes through StoreKit / Play Billing.)',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Buy',
                    onPress: async () => {
                        setRemoveAdsBusy(true);
                        try {
                            await adsApi.removeAdsPurchase();
                            await refreshMe();
                        } catch (err) {
                            Alert.alert('Purchase failed', err instanceof Error ? err.message : '');
                        } finally {
                            setRemoveAdsBusy(false);
                        }
                    },
                },
            ]
        );
    }

    const adsRemoved = user && 'ads' in user ? user.ads.removed : false;

    async function onPackPurchase(pack: CoinPack) {
        Alert.alert(
            pack.name,
            `${pack.coins.toLocaleString()} coins for $${pack.priceUsd.toFixed(2)}.\n\n(Receipt verification is stubbed in dev — production routes through StoreKit / Play Billing.)`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Buy',
                    onPress: async () => {
                        setPackBusyId(pack.id);
                        try {
                            await coinsApi.purchase(pack.id);
                            await refreshMe();
                            Alert.alert('Coins added', `+${pack.coins.toLocaleString()} coins`);
                        } catch (err) {
                            Alert.alert(
                                'Purchase failed',
                                err instanceof Error ? err.message : 'Try again.'
                            );
                        } finally {
                            setPackBusyId(null);
                        }
                    },
                },
            ]
        );
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
                                            : '$4.99 one-time. No more interstitial ads, ever.'}
                                    </Text>
                                </View>
                            </View>
                            {!adsRemoved ? (
                                <Button
                                    label="Buy"
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
            />
        </SafeAreaView>
    );
}

function ShopItem({
    cosmetic,
    equipped,
    busy,
    onPurchase,
    onEquip,
}: {
    cosmetic: Cosmetic;
    equipped: boolean;
    busy: boolean;
    onPurchase: () => void;
    onEquip: () => void;
}) {
    const priceLabel =
        cosmetic.priceCents === 0
            ? 'Free'
            : `$${(cosmetic.priceCents / 100).toFixed(2)}`;
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
                        style={[styles.rarity, { color: RARITY_COLOR[cosmetic.rarity] }]}
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
                    <Text style={styles.price} allowFontScaling={false}>
                        {cosmetic.owned ? '' : priceLabel}
                    </Text>
                    <Pressable
                        onPress={onPress}
                        disabled={busy || equipped}
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
                                {action}
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
                    ${pack.priceUsd.toFixed(2)}
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

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
    header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
    title: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.bold,
    },
    subtitle: {
        color: colors.textDim,
        marginTop: spacing.xs,
        fontSize: typography.sizes.sm,
    },
    group: { marginTop: spacing.lg, gap: spacing.sm },
    groupTitle: {
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
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
    },
    rarity: {
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: typography.weights.bold,
    },
    itemDesc: {
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
    actionEquip: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    actionEquipped: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
    actionLabel: {
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
        color: '#0F1115',
    },
    empty: {
        textAlign: 'center',
        color: colors.textDim,
        marginTop: spacing.xl,
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
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    removeAdsSub: {
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
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    coinHeaderSub: {
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
        color: colors.textMuted,
        fontSize: 9,
        letterSpacing: 1,
        fontWeight: typography.weights.bold,
    },
});
