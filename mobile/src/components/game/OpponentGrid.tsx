import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Tile } from './Tile';
import { spacing } from '../../theme/typography';
import type { Tile as TileColor } from '../../types/index';
import { makeThemedStyles } from '../../theme/colors';

interface Props {
    wordLength: number;
    /** Tile colors only — opponent letters are never revealed mid-match. */
    guesses: { tiles: TileColor[] }[];
    maxRows?: number;
}

export const OpponentGrid: React.FC<Props> = ({
    wordLength,
    guesses,
    maxRows = 6,
}) => {
    const rows: (TileColor | null)[][] = [];
    for (let r = 0; r < maxRows; r++) {
        if (r < guesses.length) {
            rows.push(guesses[r]!.tiles);
        } else {
            rows.push(new Array(wordLength).fill(null));
        }
    }

    return (
        <View style={styles.grid}>
            {rows.map((row, rowIdx) => (
                <View key={`oppRow-${rowIdx}`} style={styles.row}>
                    {row.map((state, colIdx) => (
                        <Tile
                            key={`oppTile-${rowIdx}-${colIdx}`}
                            letter={null}
                            state={state}
                            hideLetter
                            size="sm"
                        />
                    ))}
                </View>
            ))}
        </View>
    );
};

const styles = makeThemedStyles(() => StyleSheet.create({
    grid: {
        gap: 2,
        alignItems: 'center',
    },
    row: {
        flexDirection: 'row',
        gap: 2,
    },
}));
