// Welcome-back celebration for closed leaderboards. The best result leads:
// a gold, silver or bronze trophy for 1st–3rd, a medal for the top 10, a
// star for the top 100, with a coin burst sized to the placing and the
// coins counting up. A player who missed the prizes sees how close they were.

import React, { useEffect, useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import type { LeaderboardReward } from '../../types/index';
import { Button } from './Button';
import { CountUp } from './CountUp';
import { PopIn } from './PopIn';
import { notify, NotificationType } from '../../lib/haptics';
import { playSound } from '../../lib/sound';
import { buildLeaderboardShareMessage, shareText } from '../../share/shareResult';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

type Look = { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; coins: number };

/** Within this many places of the prizes a miss reads "so close" (server: CLOSE_MISS). */
const CLOSE_MISS = 50;
const gapFor = (r: LeaderboardReward) => r.rank - 100;

function lookFor(r: LeaderboardReward): Look {
    if (!r.coins) return { icon: 'flag', color: colors.textMuted, title: gapFor(r) <= CLOSE_MISS ? 'SO CLOSE!' : 'KEEP CLIMBING!', coins: 0 };
    if (r.rank === 1) return { icon: 'trophy', color: '#FFD54A', title: '1ST PLACE!', coins: 22 };
    if (r.rank === 2) return { icon: 'trophy', color: '#D7DEE6', title: '2ND PLACE!', coins: 16 };
    if (r.rank === 3) return { icon: 'trophy', color: '#E0915A', title: '3RD PLACE!', coins: 12 };
    if (r.rank <= 10) return { icon: 'medal', color: colors.primary, title: 'TOP 10!', coins: 9 };
    return { icon: 'star', color: colors.warning, title: 'TOP 100!', coins: 6 };
}

function line(r: LeaderboardReward): string {
    const rank = r.rank.toLocaleString();
    if (r.coins) return `+${r.coins} coins · #${rank} on ${r.label}`;
    const gap = gapFor(r);
    return gap <= CLOSE_MISS ? `#${rank} on ${r.label} · ${gap} ${gap === 1 ? 'place' : 'places'} from a prize` : `#${rank} on ${r.label}`;
}

/** One coin flying out of the trophy and falling away. */
const Coin: React.FC<{ angle: number; dist: number; delayMs: number }> = ({ angle, dist, delayMs }) => {
    const p = useSharedValue(0);
    useEffect(() => {
        p.value = withDelay(delayMs, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
    }, [delayMs, p]);
    const style = useAnimatedStyle(() => ({
        opacity: p.value < 0.75 ? 1 : (1 - p.value) * 4,
        transform: [
            { translateX: Math.cos(angle) * dist * p.value },
            { translateY: Math.sin(angle) * dist * p.value + 140 * p.value * p.value },
            { scale: 0.6 + 0.6 * Math.min(1, p.value * 3) },
        ],
    }));
    return (
        <Animated.View style={[styles.coin, style]}>
            <Ionicons name="ellipse" size={14} color={colors.warning} />
        </Animated.View>
    );
};

export const RewardCelebration: React.FC<{ rewards: LeaderboardReward[]; onDone: () => void }> = ({ rewards, onDone }) => {
    const reduced = useReducedMotion();
    // Lead with the biggest prize (then the best placing); a miss only if nothing paid.
    const ordered = useMemo(
        () => [...rewards].sort((a, b) => b.coins - a.coins || a.rank - b.rank),
        [rewards]
    );
    const best = ordered[0]!;
    const look = lookFor(best);
    const total = rewards.reduce((n, r) => n + r.coins, 0);
    const coins = useMemo(
        () =>
            Array.from({ length: reduced ? 0 : look.coins }, (_, i) => ({
                // Mostly upward fan, a little spread.
                angle: -Math.PI / 2 + (i / Math.max(1, look.coins - 1) - 0.5) * Math.PI * 1.3,
                dist: 70 + ((i * 37) % 60),
                delayMs: 250 + (i % 6) * 40,
            })),
        [reduced, look.coins]
    );

    const glow = useSharedValue(0);
    useEffect(() => {
        notify(total ? NotificationType.Success : NotificationType.Warning);
        if (total) playSound('coins');
        if (!reduced) glow.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), 3);
    }, [reduced, glow, total]);
    const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.35 * glow.value, transform: [{ scale: 1 + 0.12 * glow.value }] }));

    return (
        <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onDone}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.hero}>
                        <Animated.View style={[styles.glow, { backgroundColor: look.color }, glowStyle]} />
                        {coins.map((c, i) => (
                            <Coin key={i} {...c} />
                        ))}
                        <PopIn delayMs={80}>
                            <Ionicons name={look.icon} size={92} color={look.color} />
                        </PopIn>
                    </View>

                    <Text style={[styles.title, { color: look.color }]} allowFontScaling={false}>
                        {look.title}
                    </Text>
                    <Text style={styles.sub} allowFontScaling={false}>
                        #{best.rank.toLocaleString()} on {best.label}
                    </Text>

                    {total ? (
                        <View style={styles.coinsRow}>
                            <Ionicons name="ellipse" size={18} color={colors.warning} />
                            <CountUp to={total} prefix="+" delayMs={350} durationMs={900} style={styles.coinsText} allowFontScaling={false} />
                            <Text style={styles.coinsLabel} allowFontScaling={false}>
                                coins
                            </Text>
                        </View>
                    ) : (
                        <Text style={styles.miss} allowFontScaling={false}>
                            {gapFor(best) <= CLOSE_MISS
                                ? `${gapFor(best)} ${gapFor(best) === 1 ? 'place' : 'places'} from a prize. The top 100 win coins, so play today to climb in!`
                                : 'The top 100 win coins. Play today to climb in!'}
                        </Text>
                    )}

                    {ordered.length > 1 ? (
                        <View style={styles.more}>
                            {ordered.slice(1, 6).map((r) => (
                                <Text key={r.id} style={styles.moreLine} allowFontScaling={false} numberOfLines={2}>
                                    {line(r)}
                                </Text>
                            ))}
                        </View>
                    ) : null}

                    <Button label={total ? 'Collect' : "Let's go"} icon={total ? 'checkmark' : 'flash'} onPress={onDone} style={styles.btn} />
                    {best.coins > 0 ? (
                        <Button
                            label="Share"
                            icon="share-social"
                            variant="secondary"
                            onPress={() => shareText(buildLeaderboardShareMessage({ board: best.label, rank: best.rank, coins: best.coins }), `results_${best.board}`)}
                            style={styles.shareBtn}
                        />
                    ) : null}
                </View>
            </View>
        </Modal>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.78)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.lg,
        },
        card: {
            width: '100%',
            maxWidth: 380,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: spacing.xl,
            paddingHorizontal: spacing.lg,
            alignItems: 'center',
            gap: spacing.sm,
        },
        hero: {
            width: 160,
            height: 130,
            alignItems: 'center',
            justifyContent: 'center',
        },
        glow: {
            position: 'absolute',
            width: 130,
            height: 130,
            borderRadius: 65,
        },
        coin: { position: 'absolute' },
        title: {
            fontFamily: typography.familyDisplay,
            fontWeight: typography.weights.black,
            fontSize: 30,
            letterSpacing: 1,
        },
        sub: {
            color: colors.text,
            fontFamily: typography.familyMono,
            fontSize: 13,
            textAlign: 'center',
        },
        coinsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: spacing.xs,
        },
        coinsText: {
            color: colors.warning,
            fontFamily: typography.familyDisplay,
            fontWeight: typography.weights.black,
            fontSize: 34,
        },
        coinsLabel: {
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 13,
            marginTop: 8,
        },
        miss: {
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 13,
            textAlign: 'center',
            lineHeight: 19,
        },
        more: {
            alignSelf: 'stretch',
            gap: 4,
            paddingTop: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        moreLine: {
            color: colors.textMuted,
            fontFamily: typography.familyMono,
            fontSize: 11,
            textAlign: 'center',
        },
        btn: { alignSelf: 'stretch', marginTop: spacing.sm },
        shareBtn: { alignSelf: 'stretch' },
    })
);
