// Player avatar: an emoji/icon face inside a circle, wrapped by the equipped
// profile-border ring (color + optional neon glow). Driven purely by equipped
// cosmetic ids so it renders correctly for you AND opponents.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { avatarVisual, borderVisual } from '../../lib/cosmetics';

interface Props {
    avatarId?: string | null;
    borderId?: string | null;
    size?: number;
}

export const Avatar: React.FC<Props> = ({ avatarId, borderId, size = 64 }) => {
    const av = avatarVisual(avatarId);
    const border = borderVisual(borderId);
    const ringColor = border?.color ?? colors.border;
    const ringWidth = border ? Math.max(2, Math.round(size * 0.045)) : 2;

    return (
        <View
            style={[
                styles.ring,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderWidth: ringWidth,
                    borderColor: ringColor,
                    backgroundColor: colors.surfaceElevated,
                },
                border?.glow
                    ? {
                          shadowColor: ringColor,
                          shadowOpacity: 0.8,
                          shadowRadius: size * 0.22,
                          shadowOffset: { width: 0, height: 0 },
                          elevation: 8,
                      }
                    : null,
            ]}
        >
            {av.emoji ? (
                <Text style={{ fontSize: size * 0.5 }} allowFontScaling={false}>
                    {av.emoji}
                </Text>
            ) : (
                <Ionicons name={av.icon ?? 'person'} size={size * 0.52} color={av.color} />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    ring: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
