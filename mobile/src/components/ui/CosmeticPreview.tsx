// Renders a visual preview for any cosmetic, by category + id. Used by the
// equip transition overlay (before → after) and can back the shop swatches.
// Board-theme colors resolve from render_data when available, else from the
// id map in lib/cosmetics.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { Avatar } from './Avatar';
import { PlayerName } from './PlayerName';
import { boardThemeColors, victoryPreview } from '../../lib/cosmetics';
import type { CosmeticCategory } from '../../types/index';

interface Props {
    category: CosmeticCategory;
    id: string | null;
    /** Optional render_data (board themes) for exact colors. */
    renderData?: Record<string, unknown> | null;
    size?: number;
}

export const CosmeticPreview: React.FC<Props> = ({ category, id, renderData, size = 64 }) => {
    switch (category) {
        case 'avatar':
            return <Avatar avatarId={id} size={size} />;

        case 'profile_border':
            return <Avatar avatarId="avatar_default" borderId={id} size={size} />;

        case 'board_theme': {
            const rd = renderData as Partial<ReturnType<typeof boardThemeColors>> | undefined;
            const c = {
                ...boardThemeColors(id),
                ...(rd ?? {}),
            };
            const tile = size * 0.26;
            return (
                <View
                    style={[
                        styles.board,
                        { width: size, height: size, borderRadius: size * 0.18, backgroundColor: c.bg },
                    ]}
                >
                    <View style={styles.boardRow}>
                        <View style={{ width: tile, height: tile, borderRadius: 4, backgroundColor: c.correct }} />
                        <View style={{ width: tile, height: tile, borderRadius: 4, backgroundColor: c.misplaced }} />
                        <View style={{ width: tile, height: tile, borderRadius: 4, backgroundColor: c.wrong }} />
                    </View>
                </View>
            );
        }

        case 'nameplate':
            return (
                <View
                    style={[
                        styles.chip,
                        {
                            minWidth: size * 1.3,
                            paddingVertical: size * 0.14,
                            backgroundColor: colors.surfaceElevated,
                        },
                    ]}
                >
                    <PlayerName
                        username="Player"
                        nameplateId={id}
                        style={{
                            fontFamily: typography.familyDisplay,
                            fontSize: size * 0.28,
                            fontWeight: typography.weights.bold,
                        }}
                    />
                </View>
            );

        case 'victory_anim': {
            const v = victoryPreview(id);
            return (
                <View
                    style={[
                        styles.circle,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            borderColor: v.color,
                            backgroundColor: colors.surfaceElevated,
                        },
                    ]}
                >
                    <Ionicons name={v.icon} size={size * 0.5} color={v.color} />
                </View>
            );
        }

        default:
            return <View style={{ width: size, height: size }} />;
    }
};

const styles = StyleSheet.create({
    board: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    boardRow: { flexDirection: 'row', gap: 4 },
    chip: {
        borderRadius: 999,
        paddingHorizontal: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circle: {
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
