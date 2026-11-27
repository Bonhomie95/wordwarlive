// A short meaning for an answer word on the results screens. The server's
// lookup returns Wiktionary text (CC BY-SA), credited below the line. Falls
// back to the game's own clue for the word when the dictionary has nothing.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { wordsApi, type WordMeaning as Meaning } from '../../api/resources';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing } from '../../theme/typography';

export function WordMeaning({ word, fallback }: { word: string; fallback?: string | null }) {
    // Keyed by word: a new answer starts blank instead of showing the last one.
    return word ? <MeaningBody key={word} word={word} fallback={fallback ?? null} /> : null;
}

function MeaningBody({ word, fallback }: { word: string; fallback: string | null }) {
    /** undefined while loading, null when there's no meaning. */
    const [meaning, setMeaning] = useState<Meaning | null | undefined>(undefined);
    useEffect(() => {
        let live = true;
        wordsApi.meaning(word).then(
            (m) => live && setMeaning(m),
            () => live && setMeaning(null)
        );
        return () => {
            live = false;
        };
    }, [word]);

    if (!meaning) {
        return fallback && meaning === null ? (
            <Text style={styles.fallback} allowFontScaling={false}>
                “{fallback}”
            </Text>
        ) : null;
    }
    return (
        <View style={styles.wrap} accessible accessibilityLabel={`${word}: ${meaning.partOfSpeech ?? ''} ${meaning.definition}`}>
            <Text style={styles.definition}>
                {meaning.partOfSpeech ? <Text style={styles.pos}>{meaning.partOfSpeech} · </Text> : null}
                {meaning.definition}
            </Text>
            <Text style={styles.credit} allowFontScaling={false}>
                Wiktionary
            </Text>
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    wrap: { alignItems: 'center', gap: 2, marginTop: spacing.xs, paddingHorizontal: spacing.md },
    definition: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        textAlign: 'center',
    },
    pos: { fontFamily: typography.familyMono, color: colors.primary, fontSize: typography.sizes.xs },
    credit: { fontFamily: typography.familyMono, color: colors.textMuted, fontSize: 10, letterSpacing: 1 },
    fallback: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: spacing.xs,
    },
}));
