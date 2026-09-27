// Olympic-style top-3 podium (2nd | 1st | 3rd) shared by the Ranks and the
// Daily Challenge boards. `score` is the line printed on each plinth.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

export interface PodiumEntry {
    userId: string;
    username: string;
    score: string;
}

const MEDAL_COLOR = {
    1: '#F4B940', // gold
    2: '#C0C0C0', // silver
    3: '#CD7F32', // bronze
} as const;

function plinthColor(place: 1 | 2 | 3): string {
    switch (place) {
        case 1: return 'rgba(244, 185, 64, 0.25)';
        case 2: return 'rgba(192, 192, 192, 0.20)';
        case 3: return 'rgba(205, 127, 50, 0.20)';
    }
}

export function Podium({ top3, meId }: { top3: PodiumEntry[]; meId: string | null }) {
    const [first, second, third] = [top3[0] ?? null, top3[1] ?? null, top3[2] ?? null];
    const col = (e: PodiumEntry | null, place: 1 | 2 | 3, height: number) =>
        e ? <PodiumColumn entry={e} place={place} height={height} isMe={e.userId === meId} /> : <View style={{ flex: 1 }} />;
    return (
        <View style={styles.podiumWrap}>
            <View style={styles.podiumRow}>
                {col(second, 2, 100)}
                {col(first, 1, 130)}
                {col(third, 3, 80)}
            </View>
        </View>
    );
}

function PodiumColumn({
    entry,
    place,
    height,
    isMe,
}: {
    entry: PodiumEntry;
    place: 1 | 2 | 3;
    height: number;
    isMe: boolean;
}) {
    return (
        <View style={styles.podiumCol} accessible accessibilityLabel={`Place ${place}, ${entry.username}, ${entry.score}`}>
            <View style={[styles.podiumAvatar, isMe ? styles.podiumAvatarMe : null]}>
                <Text style={styles.podiumInitial} allowFontScaling={false}>
                    {entry.username.slice(0, 1).toUpperCase()}
                </Text>
            </View>
            <View style={styles.podiumNameRow}>
                <Ionicons name="medal" size={14} color={MEDAL_COLOR[place]} />
                <Text style={styles.podiumName} numberOfLines={1} allowFontScaling={false}>
                    {entry.username}
                </Text>
            </View>
            <View style={[styles.podiumPlinth, { height, backgroundColor: plinthColor(place) }]}>
                <Text style={styles.podiumPlace} allowFontScaling={false}>
                    {place}
                </Text>
                <Text style={styles.podiumWins} allowFontScaling={false}>
                    {entry.score}
                </Text>
            </View>
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    podiumWrap: {
        marginBottom: spacing.lg,
    },
    podiumRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm,
    },
    podiumCol: {
        flex: 1,
        alignItems: 'center',
        gap: spacing.xs,
    },
    podiumAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    podiumAvatarMe: {
        borderColor: colors.primary,
    },
    podiumInitial: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
    },
    podiumNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        maxWidth: '100%',
    },
    podiumName: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        maxWidth: 80,
    },
    podiumPlinth: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderTopLeftRadius: radius.md,
        borderTopRightRadius: radius.md,
        gap: 2,
    },
    podiumPlace: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
        fontFamily: typography.familyMono,
    },
    podiumWins: {
        fontFamily: typography.familyDisplay,
        color: colors.textDim,
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: typography.weights.bold,
    },

}));
