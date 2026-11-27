// Live-challenge UI, mounted once in the app layout:
// - IncomingChallengeCard: slides in when someone challenges you, with a
//   countdown, Accept / Decline, and (Mystery) your word for them to guess.
// - OutgoingChallengePill: while your own challenge waits for an answer.

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from './Pressable';
import { useGameStore, type IncomingChallenge } from '../../store/gameStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

function useSecondsLeft(expiresAt?: number): number | null {
    const [left, setLeft] = useState<number | null>(null);
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => setLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
        const first = setTimeout(tick, 0);
        const every = setInterval(tick, 1000);
        return () => {
            clearTimeout(first);
            clearInterval(every);
        };
    }, [expiresAt]);
    return expiresAt ? left : null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function IncomingChallengeCard() {
    const incoming = useGameStore((s) => s.incomingChallenge);
    // Keyed by invite, so a new invite starts with a fresh word / error.
    return incoming ? <IncomingCardBody key={incoming.challengeId} incoming={incoming} /> : null;
}

function IncomingCardBody({ incoming }: { incoming: IncomingChallenge }) {
    const respond = useGameStore((s) => s.respondToChallenge);
    const reduced = useReducedMotion();
    const [word, setWord] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const secondsLeft = useSecondsLeft(incoming.expiresAt);

    const slide = useSharedValue(-40);
    const glow = useSharedValue(0);
    const bar = useSharedValue(1);
    useEffect(() => {
        slide.value = reduced ? 0 : -40;
        if (!reduced) slide.value = withSpring(0, { damping: 13, stiffness: 140 });
        glow.value = reduced ? 0.6 : withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.3, { duration: 700 })), -1);
        const left = incoming.expiresAt ? Math.max(0, incoming.expiresAt - Date.now()) : 0;
        bar.value = 1;
        if (left > 0) bar.value = withTiming(0, { duration: left, easing: Easing.linear });
        return () => {
            cancelAnimation(glow);
            cancelAnimation(bar);
        };
    }, [incoming, reduced, slide, glow, bar]);

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: slide.value }],
        shadowOpacity: 0.3 + 0.5 * glow.value,
        borderColor: glow.value > 0.65 ? colors.primary : colors.primaryDim,
    }));
    const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));

    const mystery = incoming.mode === 'mystery';
    const need = incoming.wordLength ?? 0;
    const ready = !mystery || word.length === need;

    async function answer(accept: boolean) {
        if (busy) return;
        setBusy(true);
        setError('');
        const r = await respond(accept, mystery && accept ? word : undefined);
        setBusy(false);
        if (!r.ok && r.error) setError(r.error);
    }

    return (
        <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => answer(false)}>
            {/* Keeps the Mystery word field and Accept above the iOS keyboard. */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
                <Animated.View style={[styles.card, cardStyle]} accessibilityViewIsModal>
                    <View style={styles.badgeRow}>
                        <Ionicons name={mystery ? 'help-circle' : 'flash'} size={16} color={colors.primary} />
                        <Text style={styles.badge} allowFontScaling={false}>
                            {mystery ? 'MYSTERY DUEL' : 'CHALLENGE'}
                        </Text>
                        {secondsLeft != null ? (
                            <Text style={styles.timer} allowFontScaling={false}>
                                {clock(secondsLeft)}
                            </Text>
                        ) : null}
                    </View>
                    <Text style={styles.title} allowFontScaling={false} accessibilityRole="header">
                        {incoming.fromUsername} challenges you
                    </Text>
                    <Text style={styles.sub} allowFontScaling={false}>
                        {mystery
                            ? `Each of you races the other's word. Pick a ${need}-letter word for ${incoming.fromUsername}.`
                            : 'A live 1v1 race to the same word.'}
                    </Text>
                    {mystery ? (
                        <TextInput
                            value={word}
                            onChangeText={(t) => setWord(t.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, need))}
                            placeholder={`${need} LETTERS`}
                            placeholderTextColor={colors.textMuted}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            maxLength={need}
                            style={styles.input}
                            accessibilityLabel={`Your ${need}-letter word`}
                        />
                    ) : null}
                    {error ? (
                        <Text style={styles.error} accessibilityRole="alert">
                            {error}
                        </Text>
                    ) : null}
                    <View style={styles.track}>
                        <Animated.View style={[styles.fill, barStyle]} />
                    </View>
                    <View style={styles.actions}>
                        <Pressable
                            onPress={() => answer(false)}
                            disabled={busy}
                            accessibilityRole="button"
                            style={({ pressed }) => [styles.btn, styles.decline, pressed ? styles.pressed : null]}
                        >
                            <Text style={styles.declineText} allowFontScaling={false}>
                                Decline
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={() => answer(true)}
                            disabled={busy || !ready}
                            accessibilityRole="button"
                            style={({ pressed }) => [
                                styles.btn,
                                styles.accept,
                                !ready || busy ? styles.disabled : null,
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Text style={styles.acceptText} allowFontScaling={false}>
                                {busy ? 'Starting…' : 'Accept'}
                            </Text>
                        </Pressable>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

export function OutgoingChallengePill() {
    const pending = useGameStore((s) => s.pendingChallenge);
    const phase = useGameStore((s) => s.phase);
    const cancel = useGameStore((s) => s.cancelChallenge);
    const insets = useSafeAreaInsets();
    const secondsLeft = useSecondsLeft(pending?.expiresAt);
    if (!pending || phase !== 'idle') return null;
    return (
        <View pointerEvents="box-none" style={[styles.pillWrap, { top: insets.top + spacing.xs }]}>
            <View style={styles.pill} accessibilityLiveRegion="polite">
                <Ionicons name="hourglass-outline" size={14} color={colors.primary} />
                <Text style={styles.pillText} numberOfLines={1} allowFontScaling={false}>
                    Waiting for {pending.friendName}
                    {pending.mode === 'mystery' ? ' · Mystery' : ''}
                    {secondsLeft != null ? ` · ${clock(secondsLeft)}` : ''}
                </Text>
                <Pressable onPress={cancel} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel challenge">
                    <Text style={styles.pillCancel} allowFontScaling={false}>
                        Cancel
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: '#000a',
        justifyContent: 'center',
        padding: spacing.lg,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 2,
        padding: spacing.lg,
        gap: spacing.sm,
        shadowColor: colors.primary,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 },
        elevation: 12,
    },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    badge: {
        fontFamily: typography.familyMono,
        color: colors.primary,
        fontSize: typography.sizes.xs,
        letterSpacing: 1.5,
        flex: 1,
    },
    timer: { fontFamily: typography.familyMono, color: colors.textDim, fontSize: typography.sizes.xs },
    title: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.bold,
    },
    sub: { fontFamily: typography.family, color: colors.textDim, fontSize: typography.sizes.sm },
    input: {
        fontFamily: typography.familyMono,
        color: colors.text,
        fontSize: typography.sizes.lg,
        letterSpacing: 4,
        textAlign: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingVertical: spacing.sm,
        backgroundColor: colors.bg,
    },
    error: { fontFamily: typography.family, color: colors.danger, fontSize: typography.sizes.sm },
    track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
    fill: { height: 4, backgroundColor: colors.primary },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    btn: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md },
    decline: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    declineText: { fontFamily: typography.familyDisplay, color: colors.text, fontSize: typography.sizes.md },
    accept: { backgroundColor: colors.primary },
    acceptText: {
        fontFamily: typography.familyDisplay,
        color: colors.bg,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.85 },
    pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50, elevation: 50 },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.primaryDim,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        maxWidth: '92%',
    },
    pillText: { fontFamily: typography.family, color: colors.text, fontSize: typography.sizes.sm, flexShrink: 1 },
    pillCancel: { fontFamily: typography.familyDisplay, color: colors.danger, fontSize: typography.sizes.sm },
}));
