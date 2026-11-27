// Post-game: where the match XP went. "+25 Pass XP" fills the Battle Pass bar
// from before to after, and tapping opens the Pass (each tier unlocks a
// reward), so XP is visibly worth something.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ProgressBar } from './ProgressBar';
import { battlePassApi } from '../../api/resources';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

export const PassProgress: React.FC<{ xpAwarded: number; matchId: string }> = ({ xpAwarded, matchId }) => {
    const router = useRouter();
    const [state, setState] = useState<{ tier: number; maxTier: number; perTier: number; after: number; before: number } | null>(null);
    const [filled, setFilled] = useState(false);

    useEffect(() => {
        let alive = true; // keyed by match in the parent, so each match mounts fresh
        battlePassApi
            .current()
            .then((r) => {
                if (!alive || !r.season || !r.you) return;
                const per = r.season.xpPerTier;
                const after = r.you.xp;
                setState({ tier: r.you.currentTier, maxTier: r.season.maxTier, perTier: per, after, before: Math.max(0, after - xpAwarded) });
                setTimeout(() => alive && setFilled(true), 900);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [matchId, xpAwarded]);

    if (!state || xpAwarded <= 0) return null;
    const { tier, maxTier, perTier, after, before } = state;
    const shown = filled ? after : before;
    const crossed = Math.floor(after / perTier) > Math.floor(before / perTier);
    const inTier = tier >= maxTier ? perTier : shown % perTier;
    const progress = tier >= maxTier ? 1 : crossed && !filled ? (before % perTier) / perTier : inTier / perTier;

    return (
        <Pressable
            onPress={() => router.push('/(app)/pass')}
            accessibilityRole="button"
            accessibilityLabel="Open the Battle Pass"
            style={({ pressed }) => [styles.card, pressed ? { opacity: 0.85 } : null]}
        >
            <View style={styles.head}>
                <Ionicons name="flash" size={15} color={colors.primary} />
                <Text style={styles.title} allowFontScaling={false}>
                    {filled && crossed ? `Battle Pass · Tier ${tier}! New reward to claim` : `Battle Pass · Tier ${tier}`}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
            <ProgressBar progress={progress} label="Battle Pass progress" />
            <Text style={styles.sub} allowFontScaling={false}>
                {tier >= maxTier
                    ? `+${xpAwarded} Pass XP · pass complete`
                    : `+${xpAwarded} Pass XP · ${perTier - (after % perTier)} XP to tier ${tier + 1}. Each tier unlocks a reward.`}
            </Text>
        </Pressable>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        card: {
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        title: { flex: 1, color: colors.text, fontFamily: typography.familyDisplay, fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
        sub: { color: colors.textMuted, fontFamily: typography.familyMono, fontSize: typography.sizes.xs },
    })
);
