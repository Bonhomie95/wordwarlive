import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Tile } from './Tile';
import { spacing } from '../../theme/typography';
import type { Tile as TileColor } from '../../types/index';

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
}

const DEFAULT_MAX_ROWS = 6;

/**
 * Compute tile size that fits `wordLength` tiles within the screen width.
 * For 4-5 letters we use the comfortable 56px size; for longer words we
 * shrink so the row doesn't overflow.
 */
function tileSizeFor(wordLength: number, screenWidth: number): number {
    const OUTER_PADDING = 32;
    const GAP = spacing.xs;
    const available = screenWidth - OUTER_PADDING;
    const sizeFromWidth = Math.floor(
        (available - GAP * (wordLength - 1)) / wordLength
    );
    // Clamp: never bigger than 48 (was 56 — bumped down to free vertical
    // space for the keyboard above the tab bar + banner) and never smaller
    // than 30.
    return Math.max(30, Math.min(48, sizeFromWidth));
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
}) => {
    const { width } = useWindowDimensions();
    const tileSize = tileSizeFor(wordLength, width);

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
                        const tile = (
                            <Tile
                                letter={letter}
                                state={row.tiles[colIdx] ?? null}
                                hintLetter={row.hintLetters?.[colIdx] ?? null}
                                revealDelayMs={colIdx * 80}
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

const styles = StyleSheet.create({
    grid: {
        gap: spacing.xs,
        alignItems: 'center',
    },
    row: {
        flexDirection: 'row',
        gap: spacing.xs,
    },
});
