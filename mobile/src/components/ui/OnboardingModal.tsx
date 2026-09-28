import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/colors';
import { Button } from './Button';
import { Tile } from '../game/Tile';
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
    const [guess, setGuess] = useState('');
    const [hint, setHint] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (visible) track('tutorial_started');
    }, [visible]);
    const solved = guess === 'PLANT';
    function submit() {
        const word = input.trim().toUpperCase();
        if (!/^[A-Z]{5}$/.test(word)) {
            setError('Enter five letters. Try TRAIN first.');
            return;
        }
        setError('');
        setGuess(word);
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
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    style={{ maxHeight: '92%', backgroundColor: colors.surface, borderRadius: 20 }}
                    contentContainerStyle={{ padding: 24, gap: 16 }}
                >
                    <Text
                        accessibilityRole="header"
                        style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}
                    >
                        Your first word race
                    </Text>
                    <Text style={{ color: colors.textDim }}>
                        Practice without a timer or opponent. No coins, items or rank are used. The
                        word is something that grows in a garden. Try TRAIN.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center' }}>
                        {Array.from({ length: 5 }, (_, i) => (
                            <Tile
                                key={i}
                                size={42}
                                letter={guess[i] ?? null}
                                state={guess ? score(guess)[i]! : null}
                            />
                        ))}
                    </View>
                    <Text style={{ color: colors.text }}>
                        ✓ Correct spot · ● Move this letter · × No extra copy of this letter
                    </Text>
                    {guess && (
                        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
                            {solved
                                ? 'Solved! You are ready for a real match.'
                                : 'Use the feedback and try again. Hint: P L A N T.'}
                        </Text>
                    )}
                    {!solved && (
                        <>
                            <TextInput
                                accessibilityLabel="Five-letter practice guess"
                                autoCapitalize="characters"
                                autoCorrect={false}
                                maxLength={5}
                                value={input}
                                onChangeText={setInput}
                                onSubmitEditing={submit}
                                style={{
                                    color: colors.text,
                                    borderColor: colors.border,
                                    borderWidth: 1,
                                    padding: 14,
                                    borderRadius: 10,
                                }}
                            />
                            <Button label="Check my guess" onPress={submit} />
                            <Button
                                label="Try a free practice Reveal"
                                variant="secondary"
                                onPress={() => setHint(true)}
                            />
                            {hint && (
                                <Text
                                    accessibilityLiveRegion="polite"
                                    style={{ color: colors.text }}
                                >
                                    Reveal: the first letter is P. In a match, Reveal uses one item.
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
                        Reveal uncovers a letter. Scramble briefly mixes your opponent’s display.
                        Lock blocks their power-ups for 8 seconds. Hints are limited to one for 4–7 letters and two for 8–10 letters; check the displayed cost before using one.
                    </Text>
                    <Text style={{ color: colors.textDim }}>
                        Classic: solve the shared word before your opponent, in up to six guesses.
                        Daily: solve at your own pace. After a match, Play Again starts another
                        race.
                    </Text>
                    <Button
                        label={solved ? 'Ready to play' : 'Skip practice'}
                        variant={solved ? 'primary' : 'ghost'}
                        onPress={() => {
                            track(solved ? 'tutorial_completed' : 'tutorial_skipped');
                            setInput('');
                            setGuess('');
                            setHint(false);
                            onDone();
                        }}
                    />
                </ScrollView>
            </View>
        </Modal>
    );
};
