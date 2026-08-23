// Cosmetic → visual mapping.
//
// The server stores each cosmetic's render_data, but for OTHER players we only
// receive the equipped cosmetic *ids* (PublicUser.equipped / leaderboard rows),
// not their render_data. So visuals are resolved by id here — one source of
// truth that works for yourself and opponents alike. Keep in sync with the
// seed catalog (server/migrations/010_seed_content.sql); unknown ids fall back
// gracefully.

import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

export interface AvatarVisual {
    emoji?: string;
    icon?: IconName;
    color: string;
}

/** Avatar face + accent color by cosmetic id. */
export function avatarVisual(id: string | null | undefined): AvatarVisual {
    switch (id) {
        case 'avatar_fox_01':
            return { emoji: '🦊', color: '#E8833A' };
        case 'avatar_owl_01':
            return { emoji: '🦉', color: '#C9A15A' };
        case 'avatar_default':
        default:
            return { icon: 'person', color: '#9AA1AC' };
    }
}

export interface BorderVisual {
    color: string;
    glow: boolean;
}

/** Profile-border ring by cosmetic id, or null for none/plain. */
export function borderVisual(id: string | null | undefined): BorderVisual | null {
    switch (id) {
        case 'border_bronze':
            return { color: '#A97142', glow: false };
        case 'border_diamond':
            return { color: '#7CC8FF', glow: false };
        case 'border_legend':
            return { color: '#FFD700', glow: true };
        default:
            return null;
    }
}

export type NameplateEffect = 'none' | 'solid' | 'shimmer';
export interface NameplateVisual {
    effect: NameplateEffect;
    color?: string;
}

/** Username styling by nameplate cosmetic id. */
export function nameplateVisual(id: string | null | undefined): NameplateVisual {
    switch (id) {
        case 'nameplate_gold':
            return { effect: 'solid', color: '#D4AF37' };
        case 'nameplate_rainbow':
            return { effect: 'shimmer' };
        case 'nameplate_plain':
        default:
            return { effect: 'none' };
    }
}

export type VictoryKind = 'pulse' | 'confetti' | 'lightning';

/** Victory-animation kind by cosmetic id (null = no special animation). */
export function victoryKind(id: string | null | undefined): VictoryKind | null {
    switch (id) {
        case 'victory_pulse':
            return 'pulse';
        case 'victory_confetti':
            return 'confetti';
        case 'victory_lightning':
            return 'lightning';
        default:
            return null;
    }
}

/** Shimmer palette used by the rainbow nameplate. */
export const SHIMMER_COLORS = ['#3DDC97', '#7CC8FF', '#C490FF', '#F4B940', '#3DDC97'];
