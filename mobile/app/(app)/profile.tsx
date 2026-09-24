// Profile tab. Shows the player's current rank, win/loss stats, and their
// most recent matches. Sign-out lives down here too.

import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
    Alert,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { Screen } from '../../src/components/ui/Screen';
import { TopBar } from '../../src/components/ui/TopBar';
import { Avatar } from '../../src/components/ui/Avatar';
import { PlayerName } from '../../src/components/ui/PlayerName';
import { useAuthStore } from '../../src/store/authStore';
import { matchesApi, usersApi } from '../../src/api/resources';
import type { RecentMatch } from '../../src/types/index';
import { makeThemedStyles, colors, type RankTier } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

export default function Profile() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const signOut = useAuthStore((s) => s.signOut);
    const refreshMe = useAuthStore((s) => s.refreshMe);
    const [matches, setMatches] = useState<RecentMatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [renaming, setRenaming] = useState(false);
    const [newName, setNewName] = useState('');
    const [renameBusy, setRenameBusy] = useState(false);

    // Re-fetch on every focus: the tab stays mounted, so a mount-only effect
    // left "Recent matches" stale after a game was played.
    useFocusEffect(
        useCallback(() => {
            refreshMe().catch(() => {});
            matchesApi
                .recent(20)
                .then((r) => setMatches(r.matches))
                .catch(() => setMatches([]))
                .finally(() => setLoading(false));
        }, [refreshMe])
    );

    if (!user) return null;

    const tier = (user.rankTier ?? 'stone') as RankTier;
    const totalGames = user.wins + user.losses;
    const winRate = totalGames === 0 ? 0 : Math.round((user.wins / totalGames) * 100);

    const isGuest = user.provider === 'anonymous';
    const renameCost = 'usernameChangeCost' in user ? user.usernameChangeCost : 0;

    async function submitRename() {
        const name = newName.trim();
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(name)) {
            Alert.alert('Invalid username', 'Letters, numbers, and underscores only — 3 to 16 characters.');
            return;
        }
        setRenameBusy(true);
        try {
            await usersApi.changeUsername(name);
            await refreshMe();
            setRenaming(false);
        } catch (err) {
            Alert.alert('Could not rename', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setRenameBusy(false);
        }
    }

    function onSignOut() {
        // Guests have no way to sign back into this account from another
        // session — warn them and steer towards linking first.
        if (isGuest) {
            Alert.alert(
                'Sign out of guest account?',
                'This is a guest account. Link an email, Google, or Apple sign-in first — otherwise your rank, coins, and history stay tied to this device only.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Link account',
                        onPress: () => router.push('/(app)/link-account'),
                    },
                    {
                        text: 'Sign out anyway',
                        style: 'destructive',
                        onPress: () => signOut(),
                    },
                ]
            );
            return;
        }
        Alert.alert('Sign out?', 'You can sign back in any time.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
        ]);
    }

    return (
        <Screen edges={['top']}>
            <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle} allowFontScaling={false}>
                            Change username
                        </Text>
                        <Text style={styles.modalSub} allowFontScaling={false}>
                            {renameCost > 0
                                ? `Costs ${renameCost} coins. Letters, numbers, underscores · 3–16 chars.`
                                : 'Your first change is free. Letters, numbers, underscores · 3–16 chars.'}
                        </Text>
                        <TextInput
                            value={newName}
                            onChangeText={setNewName}
                            autoCapitalize="none"
                            autoCorrect={false}
                            maxLength={16}
                            autoFocus
                            style={styles.modalInput}
                            placeholderTextColor={colors.textMuted}
                            accessibilityLabel="New username"
                        />
                        <View style={styles.modalActions}>
                            <Button label="Cancel" variant="ghost" onPress={() => setRenaming(false)} style={{ flex: 1 }} />
                            <Button label="Save" onPress={submitRename} busy={renameBusy} style={{ flex: 1 }} />
                        </View>
                    </View>
                </View>
            </Modal>
            <TopBar title="Profile" />
            <FlatList
                ListHeaderComponent={
                    <View style={styles.header}>
                        <View style={styles.identityRow}>
                            <Avatar
                                avatarId={'equipped' in user ? user.equipped?.avatar : null}
                                borderId={'equipped' in user ? user.equipped?.profileBorder : null}
                                size={64}
                            />
                            <View style={{ flex: 1 }}>
                                <Pressable
                                    onPress={() => {
                                        setNewName(user.username);
                                        setRenaming(true);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Change username"
                                    style={styles.nameRow}
                                    hitSlop={6}
                                >
                                    <PlayerName
                                        username={user.username}
                                        nameplateId={'equipped' in user ? user.equipped?.nameplate : null}
                                        style={styles.username}
                                        numberOfLines={1}
                                    />
                                    <Ionicons name="pencil" size={14} color={colors.textMuted} />
                                </Pressable>
                                <Text style={styles.provider} allowFontScaling={false}>
                                    {isGuest ? 'Guest · not linked' : `Signed in via ${user.provider}`}
                                </Text>
                            </View>
                            <RankBadge tier={tier} points={user.rankPoints} />
                        </View>

                        {isGuest ? (
                            <View style={styles.linkCard}>
                                <View style={styles.linkCardHeader}>
                                    <Ionicons
                                        name="shield-checkmark"
                                        size={18}
                                        color={colors.warning}
                                    />
                                    <Text
                                        style={styles.linkCardTitle}
                                        allowFontScaling={false}
                                    >
                                        Guest account
                                    </Text>
                                </View>
                                <Text
                                    style={styles.linkCardBody}
                                    allowFontScaling={false}
                                >
                                    Link an email, Google, or Apple sign-in to
                                    keep your rank, coins, and history — and to
                                    sign in from any device.
                                </Text>
                                <Button
                                    label="Link account"
                                    onPress={() =>
                                        router.push('/(app)/link-account')
                                    }
                                    style={{ height: 44 }}
                                />
                            </View>
                        ) : null}

                        <View style={styles.statsCard}>
                            <Stat label="Wins" value={String(user.wins)} />
                            <Stat label="Losses" value={String(user.losses)} />
                            <Stat label="Win rate" value={`${winRate}%`} />
                            <Stat
                                label="Best streak"
                                value={String('bestStreak' in user ? user.bestStreak ?? 0 : 0)}
                            />
                        </View>

                        <Text style={styles.sectionLabel} allowFontScaling={false}>
                            Recent matches
                        </Text>
                    </View>
                }
                data={matches}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => <MatchRow match={item} />}
                ListEmptyComponent={
                    !loading ? (
                        <Text style={styles.empty} allowFontScaling={false}>
                            No matches yet — tap Play to get started.
                        </Text>
                    ) : null
                }
                contentContainerStyle={styles.listContent}
                ListFooterComponent={
                    <View style={styles.footer}>
                        <Button
                            label="⚙️  Settings &amp; Theme"
                            onPress={() => router.push('/(app)/settings')}
                            variant="secondary"
                        />
                        <Button label="Sign out" onPress={onSignOut} variant="ghost" />
                    </View>
                }
            />
        </Screen>
    );
}

function MatchRow({ match }: { match: RecentMatch }) {
    const positive = match.rankDelta > 0;
    const tone = positive ? colors.primary : match.rankDelta < 0 ? colors.danger : colors.textDim;
    return (
        <View style={styles.matchRow}>
            <View style={styles.matchLeft}>
                <Ionicons
                    name={match.isWin ? 'trophy' : 'close-circle'}
                    size={20}
                    color={match.isWin ? colors.warning : colors.textMuted}
                />
                <View>
                    <Text style={styles.matchWord} allowFontScaling={false}>
                        {match.word}
                    </Text>
                    <Text style={styles.matchOpp} allowFontScaling={false}>
                        vs {match.opponentUsername}
                    </Text>
                </View>
            </View>
            <Text style={[styles.matchDelta, { color: tone }]} allowFontScaling={false}>
                {match.rankDelta > 0 ? '+' : ''}
                {match.rankDelta}
            </Text>
        </View>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.stat}>
            <Text style={styles.statValue} allowFontScaling={false}>
                {value}
            </Text>
            <Text style={styles.statLabel} allowFontScaling={false}>
                {label}
            </Text>
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
    header: { gap: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
    identityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
    },
    username: {
        color: colors.text,
        fontFamily: typography.familyDisplay,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.black,
        flexShrink: 1,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
    },
    modalCard: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.sm,
    },
    modalTitle: {
        color: colors.text,
        fontFamily: typography.familyDisplay,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
    },
    modalSub: { color: colors.textDim, fontFamily: typography.family, fontSize: typography.sizes.xs, lineHeight: 17 },
    modalInput: {
        backgroundColor: colors.surfaceElevated,
        color: colors.text,
        height: 48,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        fontFamily: typography.familyDisplay,
        fontSize: typography.sizes.md,
    },
    modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    provider: {
        color: colors.textDim,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.xs,
        marginTop: spacing.xs,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    statsCard: {
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
        color: colors.text,
        fontFamily: typography.familyMonoBold,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.black,
    },
    statLabel: {
        color: colors.textMuted,
        fontFamily: typography.familyMono,
        fontSize: 10,
        marginTop: spacing.xs,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    sectionLabel: {
        color: colors.textDim,
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.sm,
        marginTop: spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    matchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    matchLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    matchWord: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
        fontFamily: typography.familyMono,
    },
    matchOpp: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
    },
    matchDelta: {
        fontFamily: typography.familyMono,
        fontWeight: typography.weights.bold,
        fontSize: typography.sizes.md,
    },
    empty: {
        textAlign: 'center',
        color: colors.textDim,
        marginTop: spacing.xl,
    },
    footer: { marginTop: spacing.xl, gap: spacing.sm },
    linkCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.warning,
        padding: spacing.md,
        gap: spacing.sm,
    },
    linkCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    linkCardTitle: {
        color: colors.warning,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    linkCardBody: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        lineHeight: 19,
    },
}));
