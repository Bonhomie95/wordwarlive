// Mystery mode lobby. Player submits a word here; tapping FIND OPPONENT
// routes to the SAME matchmaking screen classic uses, with a
// ?mode=mystery query param. From there the matchmaking + match flow is
// identical to classic — same UI, same VS splash, same resume logic.

import { useCallback, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { mysteryApi, type MysterySubmission } from '../../src/api/resources';
import { Button } from '../../src/components/ui/Button';
import { colors } from '../../src/theme/colors';
import { typography, radius, spacing } from '../../src/theme/typography';

export default function MysteryScreen() {
    const router = useRouter();
    const [word, setWord] = useState('');
    const [pending, setPending] = useState<MysterySubmission | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const r = await mysteryApi.pending();
            setPending(r.submission);
        } catch {
            // soft fail
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    async function onSubmitWord() {
        const trimmed = word.trim().toUpperCase();
        if (!trimmed) return;
        setSubmitting(true);
        try {
            const r = await mysteryApi.submit(trimmed);
            if (!r.ok) {
                Alert.alert('Not accepted', r.error ?? 'Try another word.');
                return;
            }
            setPending(r.submission ?? null);
            setWord('');
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setSubmitting(false);
        }
    }

    /** Route to the shared matchmaking screen with mode=mystery. From
     *  there the unified flow (UI, VS splash, match screen) takes over. */
    function onFindOpponent() {
        if (!pending) return;
        router.push({
            pathname: '/(app)/matchmaking',
            params: { mode: 'mystery' },
        });
    }

    async function onWithdraw() {
        try {
            await mysteryApi.withdraw();
            setPending(null);
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Try again.');
        }
    }

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.header}>
                        <Pressable
                            onPress={() => router.back()}
                            hitSlop={12}
                            style={styles.backBtn}
                        >
                            <Ionicons name="chevron-back" size={24} color={colors.text} />
                        </Pressable>
                        <View>
                            <Text style={styles.title} allowFontScaling={false}>
                                Mystery Duel
                            </Text>
                            <Text style={styles.subtitle} allowFontScaling={false}>
                                Submit a word. Match someone else who submitted
                                the same length. Both of you race to crack one
                                of your words.
                            </Text>
                        </View>
                    </View>

                    {pending ? (
                        <View style={styles.pendingCard}>
                            <Text style={styles.pendingLabel} allowFontScaling={false}>
                                YOUR WORD
                            </Text>
                            <Text style={styles.pendingWord} allowFontScaling={false}>
                                {pending.word}
                            </Text>
                            <Text style={styles.pendingMeta} allowFontScaling={false}>
                                {pending.wordLength} letters · in the pool
                            </Text>
                            <View style={styles.btnRow}>
                                <Button
                                    label="FIND OPPONENT"
                                    onPress={onFindOpponent}
                                    style={{ flex: 1 }}
                                />
                                <Pressable
                                    onPress={onWithdraw}
                                    style={({ pressed }) => [
                                        styles.withdrawBtn,
                                        pressed ? { opacity: 0.85 } : null,
                                    ]}
                                >
                                    <Text
                                        style={styles.withdrawText}
                                        allowFontScaling={false}
                                    >
                                        Withdraw
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.submitCard}>
                            <Text style={styles.submitLabel} allowFontScaling={false}>
                                Your mystery word
                            </Text>
                            <TextInput
                                value={word}
                                onChangeText={setWord}
                                placeholder="e.g. PUZZLE"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                maxLength={10}
                            />
                            <Text style={styles.hint} allowFontScaling={false}>
                                4-10 letters. Must be a real word in our list.
                                Stay family-friendly — gross or slur words get
                                rejected.
                            </Text>
                            <Button
                                label="SUBMIT WORD"
                                onPress={onSubmitWord}
                                busy={submitting}
                                disabled={word.trim().length < 4}
                            />
                        </View>
                    )}

                    <View style={styles.howCard}>
                        <Text style={styles.howTitle} allowFontScaling={false}>
                            How it works
                        </Text>
                        <Text style={styles.howBody} allowFontScaling={false}>
                            1. Submit a word{'\n'}
                            2. We match you with someone who submitted a word of
                            the same length{'\n'}
                            3. Both of you guess the SAME word — randomly one of
                            yours{'\n'}
                            4. Fastest solver wins
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    backBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: colors.text,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.black,
    },
    subtitle: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        marginTop: 2,
        maxWidth: 260,
    },
    submitCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.lg,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    submitLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    input: {
        backgroundColor: colors.bg,
        borderRadius: radius.sm,
        padding: spacing.md,
        color: colors.text,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        letterSpacing: 2,
        textAlign: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    hint: {
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        marginBottom: spacing.xs,
    },
    pendingCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.lg,
        alignItems: 'center',
        gap: spacing.xs,
        borderWidth: 1,
        borderColor: colors.warning,
    },
    pendingLabel: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        letterSpacing: 1.5,
    },
    pendingWord: {
        color: colors.warning,
        fontSize: 36,
        fontWeight: typography.weights.black,
        letterSpacing: 4,
    },
    pendingMeta: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        marginBottom: spacing.sm,
    },
    btnRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        width: '100%',
    },
    withdrawBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        justifyContent: 'center',
    },
    withdrawText: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
    },
    howCard: {
        marginTop: spacing.lg,
        padding: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    howTitle: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.xs,
    },
    howBody: {
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        lineHeight: 22,
    },
});
