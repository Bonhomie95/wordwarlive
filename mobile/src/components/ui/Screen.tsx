// Standard screen shell for the revamped UI: full-bleed dark background with a
// faint neon aura bleeding down from the top, plus safe-area insets. Wrap every
// screen's content in this so the backdrop is consistent everywhere.

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { makeThemedStyles, colors, useThemeStore } from '../../theme/colors';

interface Props {
    children: React.ReactNode;
    /** Which safe-area edges to inset. Default: top + bottom. */
    edges?: Edge[];
    /** Hide the ambient top glow (e.g. the live match wants a flat field). */
    noGlow?: boolean;
    style?: ViewStyle;
}

export const Screen: React.FC<Props> = ({
    children,
    edges = ['top', 'bottom'],
    noGlow,
    style,
}) => {
    // Re-read on theme bump so the aura recolors with the active theme.
    useThemeStore((s) => s.bump);
    return (
        <View style={styles.root}>
            {!noGlow ? (
                <LinearGradient
                    colors={[withAlpha(colors.primary, 0.14), 'transparent']}
                    style={styles.aura}
                    pointerEvents="none"
                />
            ) : null}
            <SafeAreaView style={[styles.safe, style]} edges={edges}>
                {children}
            </SafeAreaView>
        </View>
    );
};

/** Add an alpha channel to a #RRGGBB hex. */
export function withAlpha(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${h}${a}`;
}

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        aura: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 260,
        },
        safe: { flex: 1 },
    })
);
