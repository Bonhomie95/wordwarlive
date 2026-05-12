// Color tokens. Designed dark-first; the brief calls for a saturated, modern
// game UI. Equipped board themes override the tile colors at render time.

export const colors = {
    // Surfaces
    bg: '#0F1115',
    surface: '#16191F',
    surfaceElevated: '#1F232B',
    border: '#2A2E37',

    // Text
    text: '#F2F4F7',
    textDim: '#9AA1AC',
    textMuted: '#6B7280',

    // Brand / accents
    primary: '#3DDC97',
    primaryDim: '#2EB47C',
    danger: '#EF4444',
    warning: '#F4B940',
    info: '#60A5FA',

    // Tile colors (used as defaults when no board theme is equipped)
    tileCorrect: '#3DDC97',
    tileMisplaced: '#F4B940',
    tileWrong: '#3A3D44',
    tileEmpty: '#1F232B',

    // Rank colors
    rankStone: '#7A8290',
    rankBronze: '#A97142',
    rankSilver: '#C5CFD8',
    rankGold: '#F4B940',
    rankPlatinum: '#A1F0E1',
    rankDiamond: '#7CC8FF',
    rankMaster: '#C490FF',
    rankLegend: '#FFD700',
} as const;

export type RankTier =
    | 'stone'
    | 'bronze'
    | 'silver'
    | 'gold'
    | 'platinum'
    | 'diamond'
    | 'master'
    | 'legend';

export const rankColors: Record<RankTier, string> = {
    stone: colors.rankStone,
    bronze: colors.rankBronze,
    silver: colors.rankSilver,
    gold: colors.rankGold,
    platinum: colors.rankPlatinum,
    diamond: colors.rankDiamond,
    master: colors.rankMaster,
    legend: colors.rankLegend,
};
