// Profile tab. Shows the player's current rank, win/loss stats, and their
// most recent matches. Sign-out lives down here too.

import { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/ui/Button';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { useAuthStore } from '../../src/store/authStore';
import { matchesApi } from '../../src/api/resources';
import type { RecentMatch } from '../../src/types/index';
import { colors, type RankTier } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

export default function Profile() {
    const user = useAuthStore((s) => s.user);
    const signOut = useAuthStore((s) => s.signOut);
    const refreshMe = useAuthStore((s) => s.refreshMe);
    const [matches, setMatches] = useState<RecentMatch[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        refreshMe().catch(() => {});
        matchesApi
            .recent(20)
            .then((r) => setMatches(r.matches))
            .catch(() => setMatches([]))
            .finally(() => setLoading(false));
    }, [refreshMe]);

    if (!user) return null;

    const tier = (user.rankTier ?? 'stone') as RankTier;
    const totalGames = user.wins + user.losses;
    const winRate = totalGames === 0 ? 0 : Math.round((user.wins / totalGames) * 100);

    function onSignOut() {
        Alert.alert('Sign out?', 'You can sign back in any time.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
        ]);
    }

    return (
        <SafeAreaView style={styles.safe}>
            <FlatList
                ListHeaderComponent={
                    <View style={styles.header}>
                        <View style={styles.identityRow}>
                            <View>
                                <Text style={styles.username} allowFontScaling={false}>
                                    {user.username}
                                </Text>
                                <Text style={styles.provider} allowFontScaling={false}>
                                    Signed in via {user.provider}
                                </Text>
                            </View>
                            <RankBadge tier={tier} points={user.rankPoints} />
                        </View>

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
                        <Button label="Sign out" onPress={onSignOut} variant="ghost" />
                    </View>
                }
            />
        </SafeAreaView>
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
                        {match.opponentIsBot ? ' (bot)' : ''}
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

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
    header: { gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
    identityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    username: {
        color: colors.text,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.bold,
    },
    provider: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        marginTop: spacing.xs,
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
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
    },
    statLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        marginTop: spacing.xs,
    },
    sectionLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        marginTop: spacing.sm,
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
    footer: { marginTop: spacing.xl },
});
