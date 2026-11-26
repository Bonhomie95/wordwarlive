// Wordle-style result sharing — the single biggest organic-growth loop a
// word game has. The emoji grid shows friends exactly how the match went
// without spoiling the word, and the trailing link turns every share into
// an install funnel.

import { Share } from 'react-native';
import type { Tile } from '../types/index';
import { apiUrl } from '../api/client';
import { track } from '../observability';

/** Install link appended to every share: the server sends iPhones to the
 *  App Store, Android to Google Play, anything else to a page with both. */
export const STORE_LINK = `${apiUrl}/get`;

const TILE_EMOJI: Record<Tile, string> = {
    correct: '🟩',
    misplaced: '🟨',
    wrong: '⬛',
};

/** High-contrast variant, matching the color-blind tile palette. */
const TILE_EMOJI_HC: Record<Tile, string> = {
    correct: '🟧',
    misplaced: '🟦',
    wrong: '⬛',
};

export function emojiGrid(
    guesses: readonly { tiles: Tile[] }[],
    highContrast = false
): string {
    const map = highContrast ? TILE_EMOJI_HC : TILE_EMOJI;
    return guesses
        .map((g) => g.tiles.map((t) => map[t]).join(''))
        .join('\n');
}

function formatDuration(sec: number | undefined): string {
    if (!sec || sec <= 0) return '';
    if (sec < 60) return ` in ${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return ` in ${m}m ${s.toString().padStart(2, '0')}s`;
}

export interface MatchShareArgs {
    result: 'win' | 'loss' | 'tie';
    guesses: readonly { tiles: Tile[] }[];
    solved: boolean;
    opponentName?: string;
    mode?: 'classic' | 'mystery';
    matchDurationSec?: number;
    highContrast?: boolean;
}

/**
 * Build the share text for a finished 1v1 match, e.g.:
 *
 *   WordWar ⚔️ Victory vs sam42 — 3/6 in 74s
 *   🟨⬛🟩⬛⬛
 *   🟩🟨⬛⬛🟩
 *   🟩🟩🟩🟩🟩
 *   Think you can beat me? https://…
 */
export function buildMatchShareMessage(args: MatchShareArgs): string {
    const vs = args.opponentName ? ` vs ${args.opponentName}` : '';
    const modeTag = args.mode === 'mystery' ? 'Mystery Duel' : 'Duel';
    const score = args.solved ? `${args.guesses.length}/6` : 'X/6';
    const time = formatDuration(args.matchDurationSec);

    const headline =
        args.result === 'win'
            ? `WordWar ⚔️ ${modeTag} won${vs} — ${score}${time}`
            : args.result === 'tie'
            ? `WordWar ⚔️ ${modeTag} tied${vs} — ${score}${time}`
            : `WordWar ⚔️ ${modeTag}${vs} — ${score}${time}`;

    const lines = [headline];
    if (args.guesses.length > 0) lines.push(emojiGrid(args.guesses, args.highContrast));
    lines.push(
        STORE_LINK ? `Think you can beat me? ${STORE_LINK}` : 'Think you can beat me?'
    );
    return lines.join('\n');
}

export interface DailyShareArgs {
    /** YYYY-MM-DD of the challenge. */
    date: string;
    guesses: readonly { tiles: Tile[] }[];
    solved: boolean;
    durationMs?: number;
    highContrast?: boolean;
}

/** Share text for the daily challenge — the classic "Wordle 942 4/6" form. */
export function buildDailyShareMessage(args: DailyShareArgs): string {
    const score = args.solved ? `${args.guesses.length}` : 'X';
    const time = formatDuration(
        args.durationMs ? Math.round(args.durationMs / 1000) : undefined
    );
    const lines = [
        `WordWar Daily ${args.date} — ${score} guess${args.guesses.length === 1 && args.solved ? '' : 'es'}${time}`,
        emojiGrid(args.guesses, args.highContrast),
    ];
    if (STORE_LINK) lines.push(STORE_LINK);
    return lines.join('\n');
}

export interface LeaderboardShareArgs {
    /** e.g. "the daily leaderboard for Nov 25" (server label). */
    board: string;
    rank: number;
    coins?: number;
}

/** Share text for a leaderboard finish ("I finished #4 on …"). */
export function buildLeaderboardShareMessage(args: LeaderboardShareArgs): string {
    const prize = args.coins ? ` and won ${args.coins} coins` : '';
    return [`WordWar 🏆 I finished #${args.rank.toLocaleString()} on ${args.board}${prize}!`, `Can you beat me? ${STORE_LINK}`].join('\n');
}

/** Open the native share sheet. Resolves once dismissed; errors swallowed
 *  (a cancelled share is not an error worth surfacing). `source` is recorded
 *  as a share_tap event. */
export async function shareText(message: string, source?: string): Promise<void> {
    if (source) track('share_tap', { offer: source });
    try {
        await Share.share({ message });
    } catch {
        // User cancelled or share sheet unavailable — nothing to do.
    }
}
