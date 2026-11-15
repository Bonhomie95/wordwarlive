import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Tile } from './Tile';
import { spacing } from '../../theme/typography';
import type { Tile as TileColor } from '../../types/index';
import { makeThemedStyles } from '../../theme/colors';

interface RowData {
    letters: (string | null)[];
    tiles: (TileColor | null)[];
    /** Per-position hint letters — only used for the active typing row. */
    hintLetters?: (string | null)[];
}

interface Props {
    wordLength: number;
    /** Completed guesses, in order. */
    guesses: { guess: string; tiles: TileColor[] }[];
    /** Active row, cell-by-cell. Each entry is the typed letter or null. */
    inputCells: (string | null)[];
    /** Cursor position within the active row. Highlighted with a thicker
     *  border so the player knows where the next letter will land. */
    inputCursor: number;
    /** Called when the user taps a tile in the active row. */
    onTilePress?: (position: number) => void;
    maxRows?: number;
    /** Hint-revealed positions { positionIndex: letter }. Rendered as a
     *  soft gold "ghost" letter at the matching position in the active
     *  typing row — zero added vertical space. */
    hintsRevealed?: Record<number, string>;
    /** Optional color palette from an equipped board_theme cosmetic.
     *  Threaded into every Tile so the whole grid re-skins. */
    boardOverride?: {
        correct?: string;
        misplaced?: string;
        wrong?: string;
        bg?: string;
    } | null;
    /** Height the grid may use; tiles shrink so every row fits it. */
    maxHeight?: number;
}

const DEFAULT_MAX_ROWS = 6;

/**
 * Compute the tile size that fits `wordLength` tiles in the screen width and
 * `maxRows` rows in `maxHeight` (when known), so short screens shrink the
 * grid instead of pushing the keyboard off screen.
 */
function tileSizeFor(wordLength: number, screenWidth: number, maxRows: number, maxHeight?: number): number {
    const OUTER_PADDING = 32;
    const GAP = spacing.xs;
    const available = screenWidth - OUTER_PADDING;
    const sizeFromWidth = Math.floor(
        (available - GAP * (wordLength - 1)) / wordLength
    );
    const sizeFromHeight = maxHeight
        ? Math.floor((maxHeight - GAP * (maxRows - 1)) / maxRows)
        : Infinity;
    // Clamp: never bigger than 48 and never smaller than 28 (Tile hides
    // letters below 28).
    return Math.max(28, Math.min(48, sizeFromWidth, sizeFromHeight));
}

export const Grid: React.FC<Props> = ({
    wordLength,
    guesses,
    inputCells,
    inputCursor,
    onTilePress,
    maxRows = DEFAULT_MAX_ROWS,
    hintsRevealed,
    boardOverride,
    maxHeight,
}) => {
    const { width } = useWindowDimensions();
    const tileSize = tileSizeFor(wordLength, width, maxRows, maxHeight);

    const rows: RowData[] = [];
    for (let r = 0; r < maxRows; r++) {
        if (r < guesses.length) {
            const g = guesses[r]!;
            rows.push({
                letters: g.guess.split(''),
                tiles: g.tiles as (TileColor | null)[],
            });
        } else if (r === guesses.length) {
            // Active row — driven by inputCells. Hint letters appear here
            // as ghost letters at positions the player hasn't typed at yet.
            const letters: (string | null)[] = [];
            const hintLetters: (string | null)[] = [];
            for (let i = 0; i < wordLength; i++) {
                letters.push(inputCells[i] ?? null);
                hintLetters.push(hintsRevealed?.[i] ?? null);
            }
            rows.push({
                letters,
                tiles: new Array(wordLength).fill(null),
                hintLetters,
            });
        } else {
            rows.push({
                letters: new Array(wordLength).fill(null),
                tiles: new Array(wordLength).fill(null),
            });
        }
    }

    const activeRowIdx = guesses.length < maxRows ? guesses.length : -1;

    return (
        <View style={styles.grid}>
            {rows.map((row, rowIdx) => (
                <View key={`row-${rowIdx}`} style={styles.row}>
                    {row.letters.map((letter, colIdx) => {
                        const isActiveRow = rowIdx === activeRowIdx;
                        const isCursor = isActiveRow && colIdx === inputCursor;
                        const solvedRow =
                            row.tiles.length > 0 && row.tiles.every((t) => t === 'correct');
                        const tile = (
                            <Tile
                                letter={letter}
                                state={row.tiles[colIdx] ?? null}
                                hintLetter={row.hintLetters?.[colIdx] ?? null}
                                revealDelayMs={colIdx * 80}
                                bounceDelayMs={solvedRow ? 420 + colIdx * 70 : undefined}
                                size={tileSize}
                                cursor={isCursor}
                                boardOverride={boardOverride ?? null}
                            />
                        );
                        if (isActiveRow && onTilePress) {
                            return (
                                <Pressable
                                    key={`tile-${rowIdx}-${colIdx}`}
                                    onPress={() => onTilePress(colIdx)}
                                    hitSlop={4}
                                >
                                    {tile}
                                </Pressable>
                            );
                        }
                        return (
                            <View key={`tile-${rowIdx}-${colIdx}`}>{tile}</View>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};

const styles = makeThemedStyles(() => StyleSheet.create({
    grid: {
        gap: spacing.xs,
        alignItems: 'center',
    },
    row: {
        flexDirection: 'row',
        gap: spacing.xs,
    },
}));
