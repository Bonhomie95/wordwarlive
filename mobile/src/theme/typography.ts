// Typography system.
//
// Two custom faces drive the "competitive / terminal" look of the revamped UI:
//   • Space Grotesk — bold geometric display for the wordmark, headings, CTAs.
//   • Space Mono    — monospace for labels, timers, ranks, stat readouts.
// Both are loaded at boot in app/_layout.tsx via @expo-google-fonts. Until
// they're ready the app falls back to the system faces below (no crash, just
// a brief system-font flash — _layout blocks render until they load).

import { Platform } from 'react-native';

// Font-family KEYS — these must match the keys registered in useFonts().
export const fonts = {
    display: 'SpaceGrotesk_700Bold',
    displaySemi: 'SpaceGrotesk_600SemiBold',
    displayMedium: 'SpaceGrotesk_500Medium',
    mono: 'SpaceMono_400Regular',
    monoBold: 'SpaceMono_700Bold',
} as const;

export const typography = {
    // Body / general text. Space Grotesk reads well at body sizes too.
    family: fonts.displayMedium,
    familyDisplay: fonts.display,
    familySemi: fonts.displaySemi,
    // Monospace for the readout aesthetic (timers, RP, all-caps labels).
    familyMono: fonts.mono,
    familyMonoBold: fonts.monoBold,
    // System fallbacks if a face fails to load.
    familySystem: Platform.select({
        ios: 'System',
        android: 'sans-serif',
        default: 'System',
    }),
    sizes: {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 20,
        xl: 28,
        xxl: 40,
        display: 52, // wordmark / hero headings
    },
    weights: {
        regular: '400' as const,
        medium: '500' as const,
        semibold: '600' as const,
        bold: '700' as const,
        black: '900' as const,
    },
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
};

export const radius = {
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
    pill: 999,
};
