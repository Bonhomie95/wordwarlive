// Blocked users management. Lists everyone the player has blocked and lets
// them unblock. Reached from Settings → Account → Blocked users.

import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { blocksApi, type BlockedUser } from '../../src/api/resources';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, radius, spacing } from '../../src/theme/typography';

export default function BlockedScreen() {
    const router = useRouter();
    const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await blocksApi.list();
            setBlocked(res.blocked);
        } catch {
            setBlocked([]);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    function onUnblock(u: BlockedUser) {
        Alert.alert(
            `Unblock ${u.username}?`,
            'You may be matched with them again and they can challenge you.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Unblock',
                    onPress: async () => {
                        setBusyId(u.userId);
                        try {
                            await blocksApi.unblock(u.userId);
                            setBlocked((prev) =>
                                (prev ?? []).filter((b) => b.userId !== u.userId)
                            );
                        } catch {
                            Alert.alert('Could not unblock', 'Please try again later.');
                        } finally {
                            setBusyId(null);
                        }
                    },
                },
            ]
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
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
                    Blocked users
                </Text>
            </View>

            {blocked === null ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : blocked.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="shield-checkmark-outline" size={40} color={colors.textMuted} />
                    <Text style={styles.emptyText} allowFontScaling={false}>
                        You haven&apos;t blocked anyone.
                    </Text>
                    <Text style={styles.emptySub} allowFontScaling={false}>
                        Block a player from their profile during a match.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={blocked}
                    keyExtractor={(b) => b.userId}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.name} allowFontScaling={false}>
                                    {item.username}
                                </Text>
                                <Text style={styles.meta} allowFontScaling={false}>
                                    {item.rankPoints} RP
                                </Text>
                            </View>
                            <Pressable
                                onPress={() => onUnblock(item)}
                                disabled={busyId === item.userId}
                                style={({ pressed }) => [
                                    styles.unblockBtn,
                                    pressed ? { opacity: 0.7 } : null,
                                ]}
                            >
                                {busyId === item.userId ? (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                    <Text style={styles.unblockText} allowFontScaling={false}>
                                        Unblock
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    )}
                />
            )}
        </SafeAreaView>
    );
}

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.bg },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.lg,
        },
        backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
        title: {
            fontFamily: typography.familyDisplay,
            color: colors.text,
            fontSize: typography.sizes.xxl,
            fontWeight: typography.weights.black,
        },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
        emptyText: {
            fontFamily: typography.familyDisplay,
            color: colors.textDim,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.semibold,
            marginTop: spacing.sm,
        },
        emptySub: {
            fontFamily: typography.family,
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
            textAlign: 'center',
        },
        list: { padding: spacing.lg, gap: spacing.sm },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            marginBottom: spacing.sm,
        },
        name: {
            fontFamily: typography.familyDisplay,
            color: colors.text,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.semibold,
        },
        meta: {
            fontFamily: typography.familyMono,
            color: colors.textMuted,
            fontSize: typography.sizes.xs,
            marginTop: 2,
        },
        unblockBtn: {
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.primary,
            minWidth: 84,
            alignItems: 'center',
        },
        unblockText: {
            fontFamily: typography.familyDisplay,
            color: colors.primary,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.bold,
        },
    })
);
