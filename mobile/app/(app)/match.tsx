// Live match screen. Renders:
//   - the timer at the top
//   - the player's grid (full-size, with letters)
//   - the opponent's mini-grid (tile colors only, no letters)
//   - the keyboard
//
// All state flows through useGameStore; the socket layer pushes updates.
// When match_over fires, we navigate to /post-game.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { Grid } from '../../src/components/game/Grid';
import { OpponentGrid } from '../../src/components/game/OpponentGrid';
import { Keyboard, deriveLetterStates } from '../../src/components/game/Keyboard';
import { Timer } from '../../src/components/game/Timer';
import { HintButton } from '../../src/components/game/HintButton';
import { VsSplash } from '../../src/components/game/VsSplash';
import { PlayerStatsModal } from '../../src/components/game/PlayerStatsModal';
import { RankBadge } from '../../src/components/ui/RankBadge';
import { Toast } from '../../src/components/ui/Toast';
import { useGameStore } from '../../src/store/gameStore';
import { useAuthStore } from '../../src/store/authStore';
import { makeThemedStyles, colors, type RankTier } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

const HINT_COIN_COST = 50;

export default function Match() {
    const router = useRouter();
    const phase = useGameStore((s) => s.phase);
    const matchFound = useGameStore((s) => s.matchFound);
    const myGuesses = useGameStore((s) => s.myGuesses);
    const oppGuesses = useGameStore((s) => s.oppGuesses);
    const inputCells = useGameStore((s) => s.inputCells);
    const inputCursor = useGameStore((s) => s.inputCursor);
    // NOTE: msRemaining intentionally NOT read here. Timer subscribes
    // itself, so per-second ticks only re-render the Timer node — not the
    // whole match screen. Big win for phone-heat on long matches.
    const lastError = useGameStore((s) => s.lastError);
    const submitting = useGameStore((s) => s.submitting);
    const scrambled = useGameStore((s) => s.scrambled);

    const appendLetter = useGameStore((s) => s.appendLetter);
    const backspace = useGameStore((s) => s.backspace);
    const seekCursor = useGameStore((s) => s.seekCursor);
    const submitGuess = useGameStore((s) => s.submitGuess);
    const quitMatch = useGameStore((s) => s.quitMatch);
    const requestHint = useGameStore((s) => s.requestHint);
    const hintsRevealed = useGameStore((s) => s.hintsRevealed);
    const hintRequesting = useGameStore((s) => s.hintRequesting);
    const hintToast = useGameStore((s) => s.hintToast);
    const clearError = useGameStore((s) => s.clearError);
    const clearHintToast = useGameStore((s) => s.clearHintToast);
    const user = useAuthStore((s) => s.user);
    const refreshMe = useAuthStore((s) => s.refreshMe);

    // Track whether THIS screen is focused. The bounces below are gated
    // on it so a blurred-but-still-mounted match screen (expo-router keeps
    // screens mounted) can't hijack navigation - e.g. when post-game's
    // "Play again" resets the phase to 'idle', a non-gated bounce here
    // would yank the user Home instead of letting matchmaking re-queue.
    const focusedRef = useRef(false);
    useFocusEffect(
        useCallback(() => {
            focusedRef.current = true;
            return () => {
                focusedRef.current = false;
            };
        }, [])
    );

    // Bounce to post-game on match_over (only while focused).
    useEffect(() => {
        if (focusedRef.current && phase === 'finished') {
            router.navigate('/(app)/post-game');
        }
    }, [phase, router]);

    // Bounce home if we somehow landed here without a match (only while
    // focused) - prevents the blurred screen from stealing navigation.
    useEffect(() => {
        if (focusedRef.current && phase === 'idle') {
            router.navigate('/(app)');
        }
    }, [phase, router]);

    // Shake animation for invalid input.
    const shakeX = useSharedValue(0);
    const lastErrorRef = useRef<string | null>(null);
    useEffect(() => {
        if (lastError && lastError !== lastErrorRef.current) {
            lastErrorRef.current = lastError;
            shakeX.value = withSequence(
                withTiming(-10, { duration: 50 }),
                withTiming(10, { duration: 50 }),
                withTiming(-6, { duration: 50 }),
                withTiming(0, { duration: 50 })
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        }
    }, [lastError, shakeX]);

    const shakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeX.value }],
    }));

    const letterStates = useMemo(() => deriveLetterStates(myGuesses), [myGuesses]);

    // Player stats modal (tap a player card to open). Must be declared
    // BEFORE the early-return-on-no-matchFound below, or hooks order
    // changes between renders and React throws "Rendered fewer hooks than
    // expected" — which crashes the whole tab layout.
    //
    // PublicUser is the type used inside MatchFound for both `you` and
    // `opponent`. We type loosely as `unknown` here because we don't have
    // `matchFound` resolved yet — the modal handles null + we narrow at
    // the call sites below.
    type StatsPlayer = { player: NonNullable<typeof matchFound>['you']; title: string } | null;
    const [statsPlayer, setStatsPlayer] = useState<StatsPlayer>(null);

    // VS splash — shown for a fixed 2.5s when the match screen first
    // mounts with a match. We DON'T gate it on `phase === 'matched'`
    // because the server flips matched→playing within ~half a second,
    // which made the splash invisible. A timer keeps it on long enough
    // to actually read both players' names + stats.
    const [showSplash, setShowSplash] = useState(true);
    // Re-trigger the VS splash for EVERY match. match.tsx stays mounted
    // across games (expo-router keeps screens), so a mount-only effect
    // would skip the splash on the 2nd+ match and on friend challenges.
    // Keying on matchId restarts the splash whenever a new match begins.
    useEffect(() => {
        if (!matchFound) return;
        setShowSplash(true);
        const t = setTimeout(() => setShowSplash(false), 2500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchFound?.matchId]);

    if (!matchFound) return null;

    const opponent = matchFound.opponent;
    const oppTier = (opponent.rankTier ?? 'stone') as RankTier;
    const me = matchFound.you;
    const meTier = (me.rankTier ?? 'stone') as RankTier;

    // Resolve the equipped board theme's render_data into the typed shape
    // Tile expects. user is typed as PublicUser | MeResponse so we narrow
    // by checking the field exists (MeResponse has it, PublicUser doesn't).
    const meUser =
        user && 'equippedRenderData' in user ? user : null;
    const equippedBoardId = meUser?.equipped?.boardTheme ?? null;
    const boardOverride = (() => {
        if (!equippedBoardId || !meUser) return null;
        const rd = meUser.equippedRenderData?.[equippedBoardId];
        if (!rd) return null;
        return {
            bg: typeof rd.bg === 'string' ? rd.bg : undefined,
            correct: typeof rd.correct === 'string' ? rd.correct : undefined,
            misplaced: typeof rd.misplaced === 'string' ? rd.misplaced : undefined,
            wrong: typeof rd.wrong === 'string' ? rd.wrong : undefined,
        };
    })();

    async function onEnter() {
        const ack = await submitGuess();
        if (!ack) return;
        if (!ack.ok) {
            // Show a brief alert for bad cases like "not in word list".
            // Rate-limit hits will refresh state instead.
            if (ack.errorCode !== 'RATE_LIMITED') {
                // The shake + lastError already handles UX; just log here if needed.
            }
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
    }

    async function onHintRequest() {
        const ack = await requestHint();
        if (!ack) return;
        if (ack.ok) {
            // Spending coins/credits affects /me; refresh so the button text
            // updates if the user clicks again.
            refreshMe().catch(() => {});
        }
    }

    /** Quit / forfeit. Confirms first so accidental taps don't cost a match. */
    function onQuitMatch() {
        Alert.alert(
            'Quit Match?',
            'Your opponent will win immediately. This counts as a loss in your stats.',
            [
                { text: 'Keep Playing', style: 'cancel' },
                {
                    text: 'Quit',
                    style: 'destructive',
                    onPress: () => quitMatch(),
                },
            ]
        );
    }

    const coinBalance = user && 'coins' in user ? user.coins : 0;
    const hintCredits = user && 'hintCredits' in user ? user.hintCredits : 0;
    const lifetimeHintsUsed =
        user && 'lifetimeHintsUsed' in user ? user.lifetimeHintsUsed : 0;
    // Server allows 2 hints for long words (8-10 letters), 1 for shorter.
    // Mirrors matchHandler.handleHint's hintCap rule.
    const hintsCap = matchFound.wordLength >= 8 ? 2 : 1;
    const hintsUsedThisMatch = Object.keys(hintsRevealed).length;
    // Hide once the player has used all their hints for this match.
    const hintsHidden = hintsUsedThisMatch >= hintsCap;

    return (
        <SafeAreaView style={styles.safe}>
            {/* Stats modal — tap any player card in the header to open. */}
            <PlayerStatsModal
                player={statsPlayer?.player ?? null}
                title={statsPlayer?.title ?? ''}
                onClose={() => setStatsPlayer(null)}
            />
            {/* VS splash before the game starts. Auto-dismisses when phase
                flips to 'playing' (server sends match_start ~1s after
                match_found). */}
            {showSplash ? (
                <VsSplash me={matchFound.you} opponent={matchFound.opponent} />
            ) : null}
            {/* Header: opponent and timer. Back arrow floats top-left and
                doubles as the forfeit button — quitting an active match is
                the same action functionally. Confirm dialog protects taps. */}
            <View style={styles.header}>
                <Pressable
                    onPress={onQuitMatch}
                    style={({ pressed }) => [
                        styles.backBtn,
                        pressed ? { opacity: 0.7, transform: [{ scale: 0.96 }] } : null,
                    ]}
                    hitSlop={10}
                >
                    <Ionicons name="chevron-back" size={16} color={colors.danger} />
                    <Text style={styles.backLabel} allowFontScaling={false}>
                        QUIT
                    </Text>
                </Pressable>
                <Pressable
                    style={styles.playerCard}
                    onPress={() => setStatsPlayer({ player: opponent, title: 'Opponent' })}
                    hitSlop={6}
                >
                    <Text style={styles.playerLabel} allowFontScaling={false}>
                        Opponent
                    </Text>
                    <Text style={styles.playerName} allowFontScaling={false}>
                        {opponent.username}
                    </Text>
                    <RankBadge tier={oppTier} size="sm" />
                </Pressable>
                <Timer />
                <Pressable
                    style={styles.playerCard}
                    onPress={() => setStatsPlayer({ player: me, title: 'Your Stats' })}
                    hitSlop={6}
                >
                    <Text style={styles.playerLabel} allowFontScaling={false}>
                        You
                    </Text>
                    <Text style={styles.playerName} allowFontScaling={false}>
                        {me.username}
                    </Text>
                    <RankBadge tier={meTier} size="sm" />
                </Pressable>
            </View>

            {/* Opponent's mini-grid — hint button floats on the right */}
            <View style={styles.oppWrap}>
                <Text style={styles.oppLabel} allowFontScaling={false}>
                    Opponent&apos;s board
                </Text>
                <OpponentGrid
                    wordLength={matchFound.wordLength}
                    guesses={oppGuesses.map((g) => ({ tiles: g.tiles }))}
                />
                <View style={styles.hintCorner}>
                    <HintButton
                        freeAvailable={lifetimeHintsUsed === 0}
                        hintCredits={hintCredits}
                        coins={coinBalance}
                        hintCost={HINT_COIN_COST}
                        hintsUsed={hintsUsedThisMatch}
                        hintsCap={hintsCap}
                        onPress={onHintRequest}
                        busy={hintRequesting}
                        hidden={hintsHidden}
                    />
                </View>
            </View>

            {/* Player's grid */}
            <Animated.View style={[styles.gridWrap, shakeStyle]}>
                <Grid
                    wordLength={matchFound.wordLength}
                    guesses={myGuesses.map((g) => ({ guess: g.guess, tiles: g.tiles }))}
                    inputCells={inputCells}
                    inputCursor={inputCursor}
                    onTilePress={seekCursor}
                    hintsRevealed={hintsRevealed}
                    boardOverride={boardOverride}
                />
                {scrambled ? (
                    <View style={styles.scrambledOverlay}>
                        <Text style={styles.scrambledText} allowFontScaling={false}>
                            SCRAMBLED!
                        </Text>
                    </View>
                ) : null}
            </Animated.View>

            {lastError ? (
                <Toast
                    visible={true}
                    message={lastError}
                    variant="error"
                    onDismiss={clearError}
                />
            ) : null}

            {hintToast ? (
                <Toast
                    visible={true}
                    message={
                        hintToast.paidWith === 'free'
                            ? `Hint: position ${hintToast.position + 1} is "${hintToast.letter}" (free)`
                            : hintToast.paidWith === 'credit'
                            ? `Hint: position ${hintToast.position + 1} is "${hintToast.letter}" (1 credit used)`
                            : `Hint: position ${hintToast.position + 1} is "${hintToast.letter}" (-${hintToast.coinsSpent} coins)`
                    }
                    variant="info"
                    onDismiss={clearHintToast}
                />
            ) : null}

            <View style={styles.kbWrap}>
                <Keyboard
                    onLetter={(l) => appendLetter(l)}
                    onEnter={onEnter}
                    onBackspace={backspace}
                    letterStates={letterStates}
                    disabled={submitting || phase !== 'playing'}
                />
            </View>
        </SafeAreaView>
    );
}

// Used for fail-safe alert during dev — kept around.
void Alert;

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg, paddingTop: 4 },
    backBtn: {
        position: 'absolute',
        top: -2,
        left: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingLeft: 4,
        paddingRight: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.danger,
        zIndex: 10,
    },
    backLabel: {
        color: colors.danger,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        marginBottom: spacing.xs,
    },
    playerCard: {
        gap: 2,
        minWidth: 100,
    },
    playerLabel: {
        color: colors.textMuted,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    playerName: {
        color: colors.text,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.bold,
    },
    botBanner: {
        backgroundColor: colors.surfaceElevated,
        borderColor: colors.warning,
        borderWidth: 1,
        marginHorizontal: spacing.lg,
        padding: 4,
        borderRadius: radius.sm,
        marginBottom: 4,
    },
    botBannerText: {
        color: colors.warning,
        fontSize: 10,
        textAlign: 'center',
    },
    oppWrap: {
        alignItems: 'center',
        gap: 2,
        marginBottom: spacing.xs,
        // Anchor for the absolutely-positioned hint button.
        position: 'relative',
        width: '100%',
    },
    hintCorner: {
        position: 'absolute',
        right: spacing.md,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    oppLabel: {
        color: colors.textDim,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    gridWrap: {
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    scrambledOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,17,21,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrambledText: {
        color: colors.warning,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.black,
        letterSpacing: 4,
    },
    errorText: {
        textAlign: 'center',
        color: colors.danger,
        fontSize: typography.sizes.sm,
        marginBottom: spacing.xs,
    },
    kbWrap: {
        // ~half-inch breathing room below the last keyboard row, since the
        // banner + tab bar are visible on this screen now.
        paddingBottom: spacing.lg,
    },
}));
