import { Platform } from 'react-native';

export const typography = {
    // Use a system font with letter-spacing tuned for the all-caps tile look.
    family: Platform.select({
        ios: 'System',
        android: 'sans-serif',
        default: 'System',
    }),
    familyMono: Platform.select({
        ios: 'Menlo',
        android: 'monospace',
        default: 'monospace',
    }),
    sizes: {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 20,
        xl: 28,
        xxl: 40,
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
    sm: 6,
    md: 10,
    lg: 16,
    pill: 999,
};
