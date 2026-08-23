// Neon-glow helpers for the revamped UI.
//
// iOS renders colored shadows faithfully (shadowColor). Android's elevation
// shadow is gray, so for the hero moments (PLAY button, VS splash, victory)
// we additionally stack a translucent colored "halo" View behind the element
// — see the `haloStyle` helper — which reads as a glow on both platforms.

import { Platform, type ViewStyle } from 'react-native';

/**
 * Colored drop-shadow. Faithful on iOS; on Android contributes elevation plus
 * whatever colored halo the component layers behind itself.
 */
export function glow(
    color: string,
    radius = 16,
    opacity = 0.55
): ViewStyle {
    return {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: opacity,
        shadowRadius: radius,
        elevation: Math.max(4, Math.round(radius / 2)),
    };
}

/** Softer, larger ambient glow for backgrounds / big hero elements. */
export function ambientGlow(color: string, radius = 40): ViewStyle {
    return {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: Platform.OS === 'ios' ? 0.45 : 0,
        shadowRadius: radius,
        elevation: 0,
    };
}

/**
 * A positioned translucent halo you render as an absolutely-placed sibling
 * BEHIND a glowing element, so Android also shows a colored bloom. Spread it
 * a little beyond the element and give it a big borderRadius.
 */
export function haloStyle(color: string, opacity = 0.35): ViewStyle {
    return {
        position: 'absolute',
        backgroundColor: color,
        opacity,
    };
}
