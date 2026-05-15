// Color theme system.
//
// Architecture note: we deliberately use a MUTABLE `colors` object that
// every component imports. When the theme changes, we mutate the object's
// fields and force a root re-render via a Zustand bump. This avoids
// rewriting every `import { colors }` site to use a hook — there are
// dozens, and they all work today.
//
// Three themes:
//   - 'classic-dark'  — the original dark scheme, free, default
//   - 'classic-light' — bright/legible, free
//   - 'neon-strike'   — the green-on-dark "design" theme, paid

import { create } from 'zustand';

export interface ThemeTokens {
    bg: string;
    surface: string;
    surfaceElevated: string;
    border: string;
    text: string;
    textDim: string;
    textMuted: string;
    primary: string;
    primaryDim: string;
    danger: string;
    warning: string;
    info: string;
    tileCorrect: string;
    tileMisplaced: string;
    tileWrong: string;
    tileEmpty: string;
    rankStone: string;
    rankBronze: string;
    rankSilver: string;
    rankGold: string;
    rankPlatinum: string;
    rankDiamond: string;
    rankMaster: string;
    rankLegend: string;
}

export type ThemeId = 'classic-dark' | 'classic-light' | 'neon-strike';

export interface ThemeMeta {
    id: ThemeId;
    name: string;
    description: string;
    isPremium: boolean;
    tokens: ThemeTokens;
}

const CLASSIC_DARK: ThemeTokens = {
    bg: '#0F1115',
    surface: '#16191F',
    surfaceElevated: '#1F232B',
    border: '#2A2E37',
    text: '#F2F4F7',
    textDim: '#9AA1AC',
    textMuted: '#6B7280',
    primary: '#3DDC97',
    primaryDim: '#2EB47C',
    danger: '#EF4444',
    warning: '#F4B940',
    info: '#60A5FA',
    tileCorrect: '#3DDC97',
    tileMisplaced: '#F4B940',
    tileWrong: '#3A3D44',
    tileEmpty: '#1F232B',
    rankStone: '#7A8290',
    rankBronze: '#A97142',
    rankSilver: '#C5CFD8',
    rankGold: '#F4B940',
    rankPlatinum: '#A1F0E1',
    rankDiamond: '#7CC8FF',
    rankMaster: '#C490FF',
    rankLegend: '#FFD700',
};

const CLASSIC_LIGHT: ThemeTokens = {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#F1F5F9',
    border: '#E2E8F0',
    text: '#0F172A',
    textDim: '#475569',
    textMuted: '#94A3B8',
    primary: '#16A34A',
    primaryDim: '#15803D',
    danger: '#DC2626',
    warning: '#D97706',
    info: '#2563EB',
    tileCorrect: '#16A34A',
    tileMisplaced: '#D97706',
    tileWrong: '#94A3B8',
    tileEmpty: '#F1F5F9',
    rankStone: '#64748B',
    rankBronze: '#92400E',
    rankSilver: '#94A3B8',
    rankGold: '#D97706',
    rankPlatinum: '#0891B2',
    rankDiamond: '#2563EB',
    rankMaster: '#7C3AED',
    rankLegend: '#CA8A04',
};

// "Neon Strike" — from the Stitch design. Green-saturated dark theme.
const NEON_STRIKE: ThemeTokens = {
    bg: '#0C160A',
    surface: '#141E12',
    surfaceElevated: '#182216',
    border: '#3B4B37',
    text: '#DAE6D2',
    textDim: '#B9CCB2',
    textMuted: '#84967E',
    primary: '#00FF41',
    primaryDim: '#00E639',
    danger: '#FFB4AB',
    warning: '#FFD739',
    info: '#72FF70',
    tileCorrect: '#00FF41',
    tileMisplaced: '#FFD739',
    tileWrong: '#2D382A',
    tileEmpty: '#141E12',
    rankStone: '#84967E',
    rankBronze: '#A97142',
    rankSilver: '#C5CFD8',
    rankGold: '#FFD739',
    rankPlatinum: '#72FF70',
    rankDiamond: '#7CC8FF',
    rankMaster: '#C490FF',
    rankLegend: '#FFD700',
};

export const THEME_CATALOG: Record<ThemeId, ThemeMeta> = {
    'classic-dark': {
        id: 'classic-dark',
        name: 'Classic Dark',
        description: 'The original. Easy on the eyes.',
        isPremium: false,
        tokens: CLASSIC_DARK,
    },
    'classic-light': {
        id: 'classic-light',
        name: 'Classic Light',
        description: 'Bright and crisp.',
        isPremium: false,
        tokens: CLASSIC_LIGHT,
    },
    'neon-strike': {
        id: 'neon-strike',
        name: 'Neon Strike',
        description: 'Acid green. Built to intimidate.',
        isPremium: true,
        tokens: NEON_STRIKE,
    },
};

/** Mutable shared color object. All components import from here.
 *  Mutated in place by `applyTheme`. */
export const colors: ThemeTokens = { ...CLASSIC_DARK };

export type RankTier =
    | 'stone'
    | 'bronze'
    | 'silver'
    | 'gold'
    | 'platinum'
    | 'diamond'
    | 'master'
    | 'legend';

/** Lookup table for rank-tier colors. Proxy makes it pick up theme swaps
 *  without forcing imports to be reread. */
export const rankColors: Record<RankTier, string> = new Proxy(
    {} as Record<RankTier, string>,
    {
        get(_target, key: string) {
            const k = key as RankTier;
            switch (k) {
                case 'stone': return colors.rankStone;
                case 'bronze': return colors.rankBronze;
                case 'silver': return colors.rankSilver;
                case 'gold': return colors.rankGold;
                case 'platinum': return colors.rankPlatinum;
                case 'diamond': return colors.rankDiamond;
                case 'master': return colors.rankMaster;
                case 'legend': return colors.rankLegend;
                default: return colors.text;
            }
        },
    }
);

interface ThemeState {
    currentTheme: ThemeId;
    /** Bumped on every applyTheme so root subscribers re-render. */
    bump: number;
    applyTheme: (id: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
    currentTheme: 'classic-dark',
    bump: 0,
    applyTheme: (id) => {
        const meta = THEME_CATALOG[id];
        if (!meta) return;
        Object.assign(colors, meta.tokens);
        set((s) => ({ currentTheme: id, bump: s.bump + 1 }));
    },
}));
