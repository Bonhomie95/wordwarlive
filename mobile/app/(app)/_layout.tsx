// Tab layout for authenticated users. Matchmaking, the live match, and the
// post-game screen sit OUTSIDE the tabs (they're full-screen stacks) so
// the tab bar doesn't hide while the player is queued or playing.
//
// Two invisible helpers are mounted here so they're always alive:
//   - MatchAutoRouter   - sends the player to the match screen the moment
//                         a match is found, from ANY tab. This is what
//                         makes friend challenges drop you straight into
//                         the VS splash, exactly like ranked matchmaking.
//   - ChallengeListener - shows the incoming friend-challenge prompt and
//                         any challenge-result notice, from any tab.

import { useEffect, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BannerAdView } from '../../src/components/ui/BannerAdView';
import { useGameStore } from '../../src/store/gameStore';
import { colors, makeThemedStyles, useThemeStore } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

/** Routes the player into the live match screen whenever a match starts,
 *  regardless of which screen they're on (queue screen, friends screen, a
 *  tab they wandered to). */
function MatchAutoRouter() {
    const router = useRouter();
    const phase = useGameStore((s) => s.phase);
    const matchFound = useGameStore((s) => s.matchFound);
    const routedRef = useRef<string | null>(null);

    useEffect(() => {
        if ((phase === 'matched' || phase === 'playing') && matchFound) {
            // Navigate once per match.
            if (routedRef.current !== matchFound.matchId) {
                routedRef.current = matchFound.matchId;
                router.navigate('/(app)/match');
            }
        }
        if (phase === 'idle' || phase === 'finished') {
            routedRef.current = null;
        }
    }, [phase, matchFound, router]);

    return null;
}

/** Surfaces incoming friend challenges + challenge-result notices as
 *  native alerts, no matter where the player is in the app. */
function ChallengeListener() {
    const incoming = useGameStore((s) => s.incomingChallenge);
    const respond = useGameStore((s) => s.respondToChallenge);
    const notice = useGameStore((s) => s.challengeNotice);
    const clearNotice = useGameStore((s) => s.clearChallengeNotice);
    const shownRef = useRef<string | null>(null);

    useEffect(() => {
        if (incoming && shownRef.current !== incoming.challengeId) {
            shownRef.current = incoming.challengeId;
            Alert.alert(
                'Friend Challenge',
                `${incoming.fromUsername} wants to play WordWar with you!`,
                [
                    {
                        text: 'Decline',
                        style: 'cancel',
                        onPress: () => respond(false),
                    },
                    { text: 'Accept', onPress: () => respond(true) },
                ],
                { cancelable: false }
            );
        }
        if (!incoming) shownRef.current = null;
    }, [incoming, respond]);

    useEffect(() => {
        if (notice) {
            Alert.alert('WordWar', notice, [
                { text: 'OK', onPress: clearNotice },
            ]);
        }
    }, [notice, clearNotice]);

    return null;
}

export default function AppTabsLayout() {
    // Subscribe to the theme bump so this navigator re-renders when the
    // theme changes - that updates the tab-bar colours (read directly off
    // `colors` in screenOptions below) AND cascades a re-render into every
    // tab screen, which is what makes makeThemedStyles pick up new colours.
    useThemeStore((s) => s.bump);
    return (
        <View style={styles.root}>
            <MatchAutoRouter />
            <ChallengeListener />
            <View style={styles.tabsWrap}>
                <Tabs
                    screenOptions={{
                        headerShown: false,
                        tabBarStyle: {
                            backgroundColor: colors.surface,
                            borderTopColor: colors.border,
                            height: 54,
                            paddingTop: 4,
                            paddingBottom: 6,
                        },
                        tabBarActiveTintColor: colors.primary,
                        tabBarInactiveTintColor: colors.textMuted,
                        tabBarLabelStyle: {
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.semibold,
                        },
                    }}
                >
                    <Tabs.Screen
                        name="index"
                        options={{
                            title: 'Play',
                            tabBarIcon: ({ color, size }) => (
                                <Ionicons name="game-controller" size={size} color={color} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="profile"
                        options={{
                            title: 'Profile',
                            tabBarIcon: ({ color, size }) => (
                                <Ionicons name="person-circle" size={size} color={color} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="leaderboard"
                        options={{
                            title: 'Ranks',
                            tabBarIcon: ({ color, size }) => (
                                <Ionicons name="trophy" size={size} color={color} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="shop"
                        options={{
                            title: 'Shop',
                            tabBarIcon: ({ color, size }) => (
                                <Ionicons name="storefront" size={size} color={color} />
                            ),
                        }}
                    />
                    <Tabs.Screen
                        name="pass"
                        options={{
                            title: 'Pass',
                            tabBarIcon: ({ color, size }) => (
                                <Ionicons name="ribbon" size={size} color={color} />
                            ),
                        }}
                    />
                    <Tabs.Screen name="matchmaking" options={{ href: null }} />
                    <Tabs.Screen name="match" options={{ href: null }} />
                    <Tabs.Screen name="post-game" options={{ href: null }} />
                    <Tabs.Screen name="settings" options={{ href: null }} />
                    <Tabs.Screen name="daily" options={{ href: null }} />
                    <Tabs.Screen name="mystery" options={{ href: null }} />
                    <Tabs.Screen name="friends" options={{ href: null }} />
                    <Tabs.Screen name="replays" options={{ href: null }} />
                </Tabs>
            </View>
            {/* Banner sits between content and tab bar. Hidden when ads_removed. */}
            <BannerAdView />
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    tabsWrap: { flex: 1 },
}));
