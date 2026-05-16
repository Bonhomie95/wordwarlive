// Friends screen.
// - Shows your friend list
// - Tap an online friend to CHALLENGE them to a live match
// - Generate an invite code to share / redeem someone else's code
// - Generate a private-match code
//
// Live challenge flow: tapping an online friend fires a real-time invite.
// They get a prompt instantly; if they accept, both players drop straight
// into the VS splash + match screen - identical to ranked matchmaking.
// While we wait, a "Waiting for ..." overlay shows, with a Cancel button.

import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { friendsApi, type FriendInfo } from '../../src/api/resources';
import { Button } from '../../src/components/ui/Button';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { useGameStore } from '../../src/store/gameStore';
import { colors, makeThemedStyles, type RankTier } from '../../src/theme/colors';
import { typography, radius, spacing } from '../../src/theme/typography';

export default function FriendsScreen() {
    const router = useRouter();
    const [friends, setFriends] = useState<FriendInfo[]>([]);
    const [redeemCode, setRedeemCode] = useState('');
    const [myCode, setMyCode] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [challenging, setChallenging] = useState(false);

    const challengeFriend = useGameStore((s) => s.challengeFriend);
    const cancelChallenge = useGameStore((s) => s.cancelChallenge);
    const pendingChallenge = useGameStore((s) => s.pendingChallenge);

    const load = useCallback(async () => {
        try {
            const r = await friendsApi.list();
            setFriends(r.friends);
        } catch {
            // soft fail
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    async function onGenerateCode() {
        setBusy(true);
        try {
            const r = await friendsApi.createCode();
            setMyCode(r.code);
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setBusy(false);
        }
    }

    async function onShareCode() {
        if (!myCode) return;
        try {
            await Share.share({
                message: `Add me on WordWar! My friend code is ${myCode}. Open WordWar -> Friends -> Redeem.`,
            });
        } catch {
            // user cancelled — no-op
        }
    }

    async function onRedeem() {
        const code = redeemCode.trim().toUpperCase();
        if (!code) return;
        setBusy(true);
        try {
            const r = await friendsApi.redeem(code);
            if (!r.ok) {
                Alert.alert('Could not redeem', r.error ?? 'Try again.');
                return;
            }
            Alert.alert('Friend added', `${r.friendUsername} is now your friend.`);
            setRedeemCode('');
            await load();
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setBusy(false);
        }
    }

    async function onPrivateMatch() {
        try {
            const r = await friendsApi.createPrivateMatch(null);
            Alert.alert(
                'Private Match Code',
                `Share this code with your friend. It expires in 15 minutes.\n\n${r.code}`,
                [
                    { text: 'Done' },
                    {
                        text: 'Share',
                        onPress: () =>
                            Share.share({
                                message: `Join me in a WordWar private match! Code: ${r.code}`,
                            }).catch(() => {}),
                    },
                ]
            );
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Try again.');
        }
    }

    /** Tap an online friend -> send them a live challenge. */
    async function onChallengeFriend(f: FriendInfo) {
        if (challenging || pendingChallenge) return;
        if (!f.isOnline) {
            Alert.alert(
                `${f.username} is offline`,
                'They need the WordWar app open to receive your challenge. Try again when they are online.'
            );
            return;
        }
        setChallenging(true);
        try {
            const ack = await challengeFriend(f.userId, f.username);
            if (!ack.ok) {
                Alert.alert('Could not challenge', ack.error);
            }
            // On success, pendingChallenge is set in the store and the
            // waiting overlay below appears automatically. When the friend
            // accepts, MatchAutoRouter drops us into the match screen.
        } finally {
            setChallenging(false);
        }
    }

    async function onRemoveFriend(f: FriendInfo) {
        Alert.alert(
            'Remove friend?',
            `Remove ${f.username} from your friends list.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await friendsApi.remove(f.userId);
                            await load();
                        } catch (err) {
                            Alert.alert(
                                'Error',
                                err instanceof Error ? err.message : 'Try again.'
                            );
                        }
                    },
                },
            ]
        );
    }

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
                    <Text style={styles.title} allowFontScaling={false}>
                        Friends
                    </Text>
                </View>

                {/* My code */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel} allowFontScaling={false}>
                        YOUR FRIEND CODE
                    </Text>
                    {myCode ? (
                        <>
                            <Text style={styles.codeText} allowFontScaling={false}>
                                {myCode}
                            </Text>
                            <Text style={styles.hint} allowFontScaling={false}>
                                Expires in 15 minutes. Tap Share to send it.
                            </Text>
                            <Button label="SHARE" onPress={onShareCode} />
                        </>
                    ) : (
                        <>
                            <Text style={styles.hint} allowFontScaling={false}>
                                Generate a code to share with a friend so they
                                can add you.
                            </Text>
                            <Button
                                label="GENERATE CODE"
                                onPress={onGenerateCode}
                                busy={busy}
                            />
                        </>
                    )}
                </View>

                {/* Redeem */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel} allowFontScaling={false}>
                        ADD A FRIEND
                    </Text>
                    <TextInput
                        value={redeemCode}
                        onChangeText={setRedeemCode}
                        placeholder="Enter their code"
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={6}
                    />
                    <Button
                        label="REDEEM"
                        onPress={onRedeem}
                        busy={busy}
                        disabled={redeemCode.trim().length < 4}
                    />
                </View>

                {/* Private match */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel} allowFontScaling={false}>
                        PRIVATE MATCH
                    </Text>
                    <Text style={styles.hint} allowFontScaling={false}>
                        Challenge a specific person. Generate a code, share it
                        with them, and when they enter it the match starts.
                    </Text>
                    <Button label="CREATE MATCH CODE" onPress={onPrivateMatch} />
                </View>

                {/* Friend list */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader} allowFontScaling={false}>
                        Your friends ({friends.length})
                    </Text>
                    {friends.length === 0 ? (
                        <Text style={styles.empty} allowFontScaling={false}>
                            No friends yet. Generate a code above and share it.
                        </Text>
                    ) : (
                        <>
                            <Text style={styles.listHint} allowFontScaling={false}>
                                Tap an online friend to challenge them to a match.
                            </Text>
                            {friends.map((f) => (
                                <Pressable
                                    key={f.userId}
                                    onPress={() => onChallengeFriend(f)}
                                    disabled={challenging || !!pendingChallenge}
                                    style={({ pressed }) => [
                                        styles.friendRow,
                                        pressed && f.isOnline
                                            ? styles.friendRowPressed
                                            : null,
                                    ]}
                                >
                                    <RankBadge
                                        tier={f.rankTier as RankTier}
                                        size="sm"
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text
                                            style={styles.friendName}
                                            allowFontScaling={false}
                                        >
                                            {f.username}
                                        </Text>
                                        <Text
                                            style={styles.friendMeta}
                                            allowFontScaling={false}
                                        >
                                            {f.rankPoints} RP
                                            {f.isOnline ? ' · online' : ' · offline'}
                                        </Text>
                                    </View>
                                    {/* Challenge affordance */}
                                    <View
                                        style={[
                                            styles.challengePill,
                                            f.isOnline
                                                ? null
                                                : styles.challengePillOff,
                                        ]}
                                    >
                                        <Ionicons
                                            name="flash"
                                            size={12}
                                            color={
                                                f.isOnline
                                                    ? colors.bg
                                                    : colors.textMuted
                                            }
                                        />
                                        <Text
                                            style={[
                                                styles.challengePillText,
                                                {
                                                    color: f.isOnline
                                                        ? colors.bg
                                                        : colors.textMuted,
                                                },
                                            ]}
                                            allowFontScaling={false}
                                        >
                                            VS
                                        </Text>
                                    </View>
                                    <Pressable
                                        onPress={() => onRemoveFriend(f)}
                                        hitSlop={12}
                                    >
                                        <Ionicons
                                            name="close-circle"
                                            size={20}
                                            color={colors.textMuted}
                                        />
                                    </Pressable>
                                </Pressable>
                            ))}
                        </>
                    )}
                </View>
            </ScrollView>

            {/* Waiting-for-friend overlay. Same spinner-style wait as
                matchmaking; closes itself when the friend accepts (the
                match starts and MatchAutoRouter takes over) or when the
                challenge is declined / cancelled / times out. */}
            <Modal
                visible={!!pendingChallenge}
                transparent
                animationType="fade"
                onRequestClose={() => cancelChallenge()}
            >
                <View style={styles.overlay}>
                    <View style={styles.overlayCard}>
                        <ActivityIndicator color={colors.primary} size="large" />
                        <Text style={styles.overlayTitle} allowFontScaling={false}>
                            Waiting for {pendingChallenge?.friendName ?? 'your friend'}…
                        </Text>
                        <Text style={styles.overlaySub} allowFontScaling={false}>
                            They&apos;ve been sent a challenge. The match starts
                            the moment they accept.
                        </Text>
                        <Button
                            label="Cancel"
                            variant="ghost"
                            onPress={() => cancelChallenge()}
                        />
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    backBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    codeText: {
        color: colors.primary,
        fontSize: 32,
        fontWeight: typography.weights.black,
        letterSpacing: 6,
        textAlign: 'center',
        marginVertical: spacing.xs,
    },
    hint: {
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 18,
    },
    input: {
        backgroundColor: colors.bg,
        borderRadius: radius.sm,
        padding: spacing.md,
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        letterSpacing: 3,
        textAlign: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    section: { gap: spacing.xs, marginTop: spacing.sm },
    sectionHeader: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: spacing.sm,
    },
    listHint: {
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        marginBottom: spacing.xs,
    },
    empty: {
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        fontStyle: 'italic',
        paddingVertical: spacing.md,
        textAlign: 'center',
    },
    friendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.xs,
    },
    friendRowPressed: {
        borderColor: colors.primary,
        backgroundColor: colors.surfaceElevated,
    },
    friendName: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
    },
    friendMeta: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
    },
    challengePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.pill,
    },
    challengePillOff: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
    },
    challengePillText: {
        fontSize: 11,
        fontWeight: typography.weights.black,
        letterSpacing: 0.5,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
    overlayCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.xl,
        alignItems: 'center',
        gap: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        width: '100%',
    },
    overlayTitle: {
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        textAlign: 'center',
    },
    overlaySub: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        textAlign: 'center',
        lineHeight: 18,
    },
}));
