// Tab layout for authenticated users. Matchmaking, the live match, and the
// post-game screen sit OUTSIDE the tabs (they're full-screen modals/stacks)
// so the tab bar doesn't hide while the player is queued or playing.

import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BannerAdView } from '../../src/components/ui/BannerAdView';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';

export default function AppTabsLayout() {
    return (
        <View style={styles.root}>
            <View style={styles.tabsWrap}>
                <Tabs
                    screenOptions={{
                        headerShown: false,
                        tabBarStyle: {
                            backgroundColor: colors.surface,
                            borderTopColor: colors.border,
                            height: 50,
                            paddingTop: 4,
                            paddingBottom: 8,
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
                </Tabs>
            </View>
            {/* Banner sits between content and tab bar. Hidden when ads_removed. */}
            <BannerAdView />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    tabsWrap: { flex: 1 },
});
