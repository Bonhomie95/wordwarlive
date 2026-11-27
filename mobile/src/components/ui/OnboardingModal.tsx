import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { Button } from './Button';
import { Tile } from '../game/Tile';
import { Keyboard, deriveLetterStates } from '../game/Keyboard';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { track } from '../../observability';
import type { Tile as TileState } from '../../types';

/** A local practice word; never consumes inventory, coins or rank. */
function score(guess: string): TileState[] {
    const answer = 'PLANT'.split('');
    const result: TileState[] = Array(5).fill('wrong');
    for (let i = 0; i < 5; i++)
        if (guess[i] === answer[i]) {
            result[i] = 'correct';
            answer[i] = '';
        }
    for (let i = 0; i < 5; i++)
        if (result[i] !== 'correct') {
            const at = answer.indexOf(guess[i]!);
            if (at >= 0) {
                result[i] = 'misplaced';
                answer[at] = '';
            }
        }
    return result;
}
export const OnboardingModal: React.FC<{ visible: boolean; onDone: () => void }> = ({
    visible,
    onDone,
}) => {
    const reduced = useReducedMotion();
    const [input, setInput] = useState('');
    // Same on-screen keyboard as a real match (the system keyboard could
    // fail to open inside this modal, leaving "Skip" as the only way out).
    const [guesses, setGuesses] = useState<{ guess: string; tiles: TileState[] }[]>([]);
    const [hint, setHint] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (visible) track('tutorial_started');
    }, [visible]);
    const last = guesses[guesses.length - 1]?.guess ?? '';
    const solved = last === 'PLANT';
    function type(letter: string) {
        if (solved || input.length >= 5) return;
        setError('');
        setInput(input + letter);
    }
    function submit() {
        if (input.length !== 5) {
            setError('Type five letters.');
            return;
        }
        setError('');
        setGuesses([...guesses, { guess: input, tiles: score(input) }]);
        setInput('');
    }
    return (
        <Modal
            visible={visible}
            transparent
            animationType={reduced ? 'none' : 'fade'}
            onRequestClose={() => {
                track('tutorial_skipped');
                onDone();
            }}
        >
            <View
                style={{ flex: 1, backgroundColor: '#000b', justifyContent: 'center', padding: 20 }}
            >
                <View
                    style={{
                        maxHeight: '92%',
                        backgroundColor: colors.surface,
                        borderRadius: 20,
                        overflow: 'hidden',
                    }}
                >
                <ScrollView
                    style={{ flexShrink: 1 }}
                    contentContainerStyle={{ padding: 24, gap: 16 }}
                >
                    <Text
                        accessibilityRole="header"
                        style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}
                    >
                        How to play
                    </Text>
                    <Text style={{ color: colors.textDim }}>
                        Beat your rival to the hidden word. Practice: type TRAIN, then ENTER.
                    </Text>
                    {[...guesses.map((g) => g.guess), ...(solved ? [] : [input])].map((word, row) => (
                        <View
                            key={row}
                            style={{ flexDirection: 'row', gap: 5, justifyContent: 'center' }}
                        >
                            {Array.from({ length: 5 }, (_, i) => (
                                <Tile
                                    key={i}
                                    size={42}
                                    letter={word[i] ?? null}
                                    state={guesses[row] ? guesses[row]!.tiles[i]! : null}
                                />
                            ))}
                        </View>
                    ))}
                    <Text style={{ color: colors.text }}>
                        ✓ right spot · ● wrong spot · × not in the word
                    </Text>
                    {last !== '' && (
                        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
                            {solved
                                ? 'Solved! You’re ready.'
                                : 'Now try PLANT.'}
                        </Text>
                    )}
                    {!solved && (
                        <>
                            <Button
                                label="Try Reveal (free here)"
                                variant="secondary"
                                onPress={() => setHint(true)}
                            />
                            {hint && (
                                <Text
                                    accessibilityLiveRegion="polite"
                                    style={{ color: colors.text }}
                                >
                                    First letter: P. In matches, Reveal uses an item.
                                </Text>
                            )}
                        </>
                    )}
                    {error && (
                        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                            {error}
                        </Text>
                    )}
                    <Text style={{ color: colors.textDim }}>
                        Power-ups: Reveal a letter · Scramble your rival’s board · Lock their
                        power-ups for 8s.
                    </Text>
                    <Text style={{ color: colors.textDim }}>
                        Classic: 6 guesses, first to solve wins. Daily: one word for everyone, no
                        clock.
                    </Text>
                    <Button
                        label={solved ? 'Ready to play' : 'Skip practice'}
                        variant={solved ? 'primary' : 'ghost'}
                        onPress={() => {
                            track(solved ? 'tutorial_completed' : 'tutorial_skipped');
                            setInput('');
                            setGuesses([]);
                            setHint(false);
                            onDone();
                        }}
                    />
                </ScrollView>
                {!solved && (
                    <View style={{ paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border }}>
                        <Keyboard
                            onLetter={type}
                            onBackspace={() => setInput(input.slice(0, -1))}
                            onEnter={submit}
                            letterStates={deriveLetterStates(guesses)}
                        />
                    </View>
                )}
                </View>
            </View>
        </Modal>
    );
};
