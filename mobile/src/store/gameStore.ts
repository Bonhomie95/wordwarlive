import { create } from 'zustand';
import { connectSocket, disconnectSocket, getSocket } from '../socket/client';
import type {
    GuessAck,
    GuessBroadcast,
    HintAck,
    MatchFound,
    MatchOver,
    QueueStatus,
    Tile,
} from '../types/index';

export type GamePhase =
    | 'idle'
    | 'queueing'
    | 'matched' // got match_found, waiting for match_start
    | 'playing'
    | 'finished';

export interface MyGuess {
    guess: string;
    tiles: Tile[];
    solved: boolean;
}
export interface OpponentGuess {
    /** Always null — server never reveals the opponent's letters mid-match. */
    guess: null;
    tiles: Tile[];
    solved: boolean;
}

interface GameState {
    phase: GamePhase;
    queueStatus: QueueStatus | null;
    matchFound: MatchFound | null;
    msRemaining: number;
    myGuesses: MyGuess[];
    oppGuesses: OpponentGuess[];
    matchOver: MatchOver | null;
    /** Last submission error from the server (rate limit, bad word, etc). */
    lastError: string | null;
    /** Per-position input buffer for the active row. Each cell is either
     *  the letter typed there or null (empty). Letters are placed at
     *  inputCursor; tapping a tile moves the cursor without losing the
     *  letters at other positions. */
    inputCells: (string | null)[];
    /** 0-indexed cursor position within the active row. Letter input lands
     *  here, then auto-advances to the next null cell (wrapping forward). */
    inputCursor: number;
    /** True when a guess submission is in flight. */
    submitting: boolean;
    /** "scrambled" visual flag — opponent power-up trigger. */
    scrambled: boolean;
    /** Set by opponent's Lock powerup. Our powerup buttons disable while
     *  Date.now() < lockedUntilMs. */
    lockedUntilMs: number | null;
    /** Brief opponent emoji reaction. UI shows ~2.5s. */
    opponentEmoji: { emoji: string; at: number } | null;
    /** Match counter for interstitial frequency capping. */
    matchesPlayedSession: number;
    /** Matches completed since the last interstitial. We compare this against
     *  nextInterstitialThreshold to decide whether to fire. */
    matchesSinceLastInterstitial: number;
    /** Re-randomized after each interstitial: when this many matches pass
     *  AND cooldown has elapsed AND the last match was long enough, we
     *  show another. Picked uniformly from [3, 4]. */
    nextInterstitialThreshold: number;
    /** ms-epoch of the last interstitial we showed. */
    lastInterstitialAt: number;
    /** Duration of the most-recently completed match, seconds. Used by
     *  shouldShowInterstitial — short matches signal "player wants to keep
     *  playing", so we skip the ad. */
    lastMatchDurationSec: number;
    /** Hint-revealed positions for THIS match — { position: letter }. */
    hintsRevealed: Record<number, string>;
    /** Whether the per-match free hint has been used yet. Updated from
     *  the hint_request ack so the UI knows whether to show "Free" or
     *  "50 coins". */
    freeHintAvailable: boolean;
    /** True while a hint request is in flight. */
    hintRequesting: boolean;
    /** Most recently revealed hint, displayed briefly as a celebratory
     *  toast. Cleared after the toast auto-dismisses or the user skips. */
    hintToast: {
        position: number;
        letter: string;
        paidWith: 'free' | 'credit' | 'coins';
        coinsSpent: number;
    } | null;

    // ─── Actions ─────────────────────────────────────────────────────────────
    connectAndQueue: (token: string, mode?: 'classic' | 'mystery') => void;
    leaveQueue: () => void;
    /** Forfeit the active match. Opponent wins immediately. */
    quitMatch: () => void;
    /** Fire an emoji reaction at the opponent. Rate-limited server-side. */
    sendEmoji: (emoji: string) => void;
    appendLetter: (l: string) => void;
    backspace: () => void;
    clearInput: () => void;
    /** Move the cursor to a specific position in the active row. Used when
     *  the user taps a tile directly. Out-of-range values are clamped. */
    seekCursor: (position: number) => void;
    submitGuess: () => Promise<GuessAck | null>;
    requestHint: () => Promise<HintAck | null>;
    /** Clear the transient error toast. */
    clearError: () => void;
    /** Clear the transient hint-reveal toast. The persistent ghost letter
     *  in the active row stays. */
    clearHintToast: () => void;
    /**
     * Decide whether a post-match interstitial should fire RIGHT NOW. Pure
     * decision; the screen calls showInterstitial() if true.
     * Returns true if (every Nth match) AND (cooldown elapsed) AND
     * (not after a loss).
     */
    shouldShowInterstitial: () => boolean;
    /** Record that we showed an interstitial; resets counters. */
    markInterstitialShown: () => void;
    reset: () => void;
}

const initial = {
    phase: 'idle' as GamePhase,
    queueStatus: null,
    matchFound: null,
    msRemaining: 0,
    myGuesses: [] as MyGuess[],
    oppGuesses: [] as OpponentGuess[],
    matchOver: null,
    lastError: null,
    inputCells: [] as (string | null)[],
    inputCursor: 0,
    submitting: false,
    scrambled: false,
    /** When non-null and > Date.now(), our powerups are locked by the
     *  opponent's Lock powerup. */
    lockedUntilMs: null as number | null,
    /** Last emoji the opponent fired, plus when. UI shows it for ~2.5s. */
    opponentEmoji: null as { emoji: string; at: number } | null,
    hintsRevealed: {} as Record<number, string>,
    freeHintAvailable: true,
    hintRequesting: false,
    hintToast: null as null | {
        position: number;
        letter: string;
        paidWith: 'free' | 'credit' | 'coins';
        coinsSpent: number;
    },
};

// Frequency-capping config for post-match interstitials. Tuned so a player
// who plays N matches in a row sees ~N/3.5 ads, never two in a row, and
// never an ad after a quick (<60s) match — short games signal the player
// wants to keep playing, so let them right back in.
const INTERSTITIAL_EVERY_N_MIN = 3;
const INTERSTITIAL_EVERY_N_MAX = 4;
const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;
const INTERSTITIAL_MIN_MATCH_SEC = 60;

export const useGameStore = create<GameState>((set, get) => ({
    ...initial,
    matchesPlayedSession: 0,
    matchesSinceLastInterstitial: 0,
    nextInterstitialThreshold:
        INTERSTITIAL_EVERY_N_MIN +
        Math.floor(Math.random() * (INTERSTITIAL_EVERY_N_MAX - INTERSTITIAL_EVERY_N_MIN + 1)),
    lastInterstitialAt: 0,
    lastMatchDurationSec: 0,

    connectAndQueue: (token, mode = 'classic') => {
        // Reset transient state for a fresh match.
        set({
            ...initial,
            phase: 'queueing',
        });
        const sock = connectSocket(token);

        const wireUp = () => {
            sock.off('queue_status').on('queue_status', (s) => {
                set({ queueStatus: s });
            });
            sock.off('match_found').on('match_found', (m: MatchFound) => {
                set({
                    phase: 'matched',
                    matchFound: m,
                    msRemaining: m.durationSeconds * 1000,
                    inputCells: new Array(m.wordLength).fill(null),
                    inputCursor: 0,
                });
            });
            sock.off('match_start').on('match_start', () => {
                set({ phase: 'playing' });
            });
            sock.off('match_tick').on('match_tick', ({ msRemaining }) => {
                set({ msRemaining });
            });
            sock.off('guess_result').on('guess_result', (g: GuessBroadcast) => {
                if (g.side === 'me') {
                    set((s) => ({
                        myGuesses: [
                            ...s.myGuesses,
                            { guess: g.guess ?? '', tiles: g.tiles, solved: g.solved },
                        ],
                        inputCells: s.matchFound
                            ? new Array(s.matchFound.wordLength).fill(null)
                            : [],
                        inputCursor: 0,
                        submitting: false,
                    }));
                } else {
                    set((s) => ({
                        oppGuesses: [
                            ...s.oppGuesses,
                            { guess: null, tiles: g.tiles, solved: g.solved },
                        ],
                    }));
                }
            });
            sock.off('match_over').on('match_over', (mo: MatchOver) => {
                set((s) => ({
                    phase: 'finished',
                    matchOver: mo,
                    matchesPlayedSession: s.matchesPlayedSession + 1,
                    matchesSinceLastInterstitial:
                        s.matchesSinceLastInterstitial + 1,
                    lastMatchDurationSec: mo.matchDurationSec ?? 0,
                }));
            });

            // Auto-resume on reconnect. The connect event fires on initial
            // connect AND every successful reconnection. We only resume if
            // the user is already in an active match — otherwise this is
            // just a fresh queue join.
            sock.off('connect').on('connect', () => {
                const phase = get().phase;
                if (phase !== 'playing' && phase !== 'matched') return;
                sock.timeout(8000).emit(
                    'match_resume',
                    {},
                    (
                        err: Error | null,
                        ack: { ok: boolean; reason?: string } = { ok: false }
                    ) => {
                        if (err || !ack.ok) {
                            // Match couldn't be resumed (most likely it ended
                            // while we were away). Push back to home; /me
                            // will reflect the result.
                            set({
                                phase: 'idle',
                                lastError:
                                    ack.reason === 'Match already ended'
                                        ? 'Match ended while you were away.'
                                        : 'Could not resume match.',
                            });
                        }
                    }
                );
            });
            sock.off('opponent_scramble').on('opponent_scramble', () => {
                set({ scrambled: true });
                setTimeout(() => set({ scrambled: false }), 1500);
            });
            sock.off('powerup_reveal_letter').on(
                'powerup_reveal_letter',
                (payload: { position: number; letter: string }) => {
                    // Reveal lands in hintsRevealed so the same ghost-letter
                    // UI surfaces it on the active row.
                    set((s) => ({
                        hintsRevealed: {
                            ...s.hintsRevealed,
                            [payload.position]: payload.letter,
                        },
                    }));
                }
            );
            sock.off('powerup_locked').on('powerup_locked', (payload) => {
                set({
                    lockedUntilMs: Date.now() + payload.durationMs,
                });
                // Lock expires automatically; UI checks Date.now().
            });
            sock.off('opponent_emoji').on(
                'opponent_emoji',
                (payload: { emoji: string }) => {
                    set({ opponentEmoji: { emoji: payload.emoji, at: Date.now() } });
                    setTimeout(() => set({ opponentEmoji: null }), 2500);
                }
            );
            sock.off('error').on('error', (e) => {
                set({ lastError: e.message });
            });
        };

        if (sock.connected) wireUp();
        else sock.once('connect', wireUp);

        // Fire the right queue event once the socket is connected. Mystery
        // mode goes through mystery_queue (handled by mysteryHub on the
        // server). Classic uses queue_join. Both end up firing match_found
        // when matched, so the rest of the flow is identical from here.
        const fireQueue = () => {
            if (mode === 'mystery') {
                sock.emit('mystery_queue', {}, (resp) => {
                    if (!resp.ok) {
                        // Surface the error via the same lastError channel
                        // the rest of the app uses.
                        set({
                            lastError: resp.error ?? 'Could not queue',
                            phase: 'idle',
                        });
                    }
                });
            } else {
                sock.emit('queue_join');
            }
        };
        if (sock.connected) fireQueue();
        else sock.once('connect', fireQueue);
    },

    leaveQueue: () => {
        const sock = getSocket();
        // Emit both — the server ignores the irrelevant one. Cheap and
        // means we don't have to track which mode the user queued for.
        sock?.emit('queue_leave');
        sock?.emit('mystery_leave', {});
        set({ phase: 'idle', queueStatus: null });
    },

    /**
     * Explicit forfeit. Emits match_quit; the server ends the match with
     * the local player as the loser and broadcasts match_over to both
     * sides. Our match_over handler will navigate to post-game.
     */
    quitMatch: () => {
        const sock = getSocket();
        if (!sock) return;
        sock.emit('match_quit', {}, () => {
            // We don't really care about the ack — match_over handles the
            // UI transition. If quit failed for some reason (match already
            // ended), match_over already fired and we're fine.
        });
    },

    sendEmoji: (emoji) => {
        const sock = getSocket();
        sock?.emit('emoji_send', { emoji });
    },

    appendLetter: (l) => {
        const { inputCells, inputCursor, matchFound, phase } = get();
        if (phase !== 'playing' || !matchFound) return;
        if (inputCursor >= matchFound.wordLength) return;
        const ch = l.toUpperCase();
        if (!/^[A-Z]$/.test(ch)) return;

        const next = [...inputCells];
        next[inputCursor] = ch;

        // Auto-advance to the next null cell. Wraps forward only — we don't
        // wrap back around to the beginning, since the user explicitly chose
        // their seek position.
        let nextCursor = inputCursor + 1;
        while (nextCursor < matchFound.wordLength && next[nextCursor] !== null) {
            nextCursor += 1;
        }
        // If everything to the right is filled, park at wordLength so the
        // user can submit. backspace/seek can move back into the row.
        set({ inputCells: next, inputCursor: nextCursor });
    },

    backspace: () => {
        const { inputCells, inputCursor, matchFound } = get();
        if (!matchFound) return;
        const cells = [...inputCells];

        // If the cursor is past the end (row was filled), back up first.
        let pos = inputCursor;
        if (pos >= matchFound.wordLength) pos = matchFound.wordLength - 1;

        if (cells[pos] !== null) {
            // Cursor sits on a letter — clear it, stay put.
            cells[pos] = null;
            set({ inputCells: cells, inputCursor: pos });
        } else if (pos > 0) {
            // Empty cell — clear the previous letter and move there.
            cells[pos - 1] = null;
            set({ inputCells: cells, inputCursor: pos - 1 });
        }
    },

    clearInput: () => {
        const { matchFound } = get();
        const len = matchFound?.wordLength ?? 0;
        set({ inputCells: new Array(len).fill(null), inputCursor: 0 });
    },

    seekCursor: (position) => {
        const { matchFound } = get();
        if (!matchFound) return;
        const clamped = Math.max(0, Math.min(matchFound.wordLength - 1, position));
        set({ inputCursor: clamped });
    },

    submitGuess: async () => {
        const { inputCells, matchFound, phase, submitting } = get();
        if (phase !== 'playing' || !matchFound) return null;
        if (submitting) return null;
        // All cells must be filled.
        if (inputCells.some((c) => c === null) || inputCells.length !== matchFound.wordLength) {
            set({ lastError: `Need ${matchFound.wordLength} letters` });
            return null;
        }
        const guess = inputCells.join('');
        const sock = getSocket();
        if (!sock) return null;

        set({ submitting: true, lastError: null });
        return new Promise((resolve) => {
            sock.timeout(8000).emit(
                'guess_submit',
                { guess },
                (
                    err: Error | null,
                    ack: GuessAck = { ok: false, error: 'Timed out' }
                ) => {
                    if (err) {
                        set({ submitting: false, lastError: 'Network timeout' });
                        resolve({ ok: false, error: 'Network timeout' });
                        return;
                    }
                    if (!ack.ok) {
                        set({ submitting: false, lastError: ack.error ?? 'Rejected' });
                        resolve(ack);
                        return;
                    }
                    // On success the server will fire guess_result, which
                    // resets inputCells and clears submitting.
                    resolve(ack);
                }
            );
        });
    },

    requestHint: async () => {
        const { phase, matchFound, hintRequesting } = get();
        if (phase !== 'playing' || !matchFound) return null;
        if (hintRequesting) return null;
        const sock = getSocket();
        if (!sock) return null;

        set({ hintRequesting: true, lastError: null });
        return new Promise<HintAck | null>((resolve) => {
            sock.timeout(8000).emit(
                'hint_request',
                {},
                (
                    err: Error | null,
                    ack: HintAck = {
                        ok: false,
                        error: 'Timed out',
                        errorCode: 'GAME_NOT_ACTIVE',
                    }
                ) => {
                    if (err) {
                        set({ hintRequesting: false, lastError: 'Network timeout' });
                        resolve(null);
                        return;
                    }
                    if (!ack.ok) {
                        set({ hintRequesting: false, lastError: ack.error });
                        resolve(ack);
                        return;
                    }
                    set((s) => ({
                        hintRequesting: false,
                        hintsRevealed: {
                            ...s.hintsRevealed,
                            [ack.position]: ack.letter,
                        },
                        freeHintAvailable: ack.freeRemaining,
                        hintToast: {
                            position: ack.position,
                            letter: ack.letter,
                            paidWith: ack.paidWith,
                            coinsSpent: ack.coinsSpent,
                        },
                    }));
                    resolve(ack);
                }
            );
        });
    },

    reset: () => {
        disconnectSocket();
        // Preserve session counters across reset so the interstitial cap
        // survives "Play Again". Without this every reset would reset the
        // counter and we'd show an ad on every match.
        const {
            matchesPlayedSession,
            matchesSinceLastInterstitial,
            nextInterstitialThreshold,
            lastInterstitialAt,
            lastMatchDurationSec,
        } = get();
        set({
            ...initial,
            matchesPlayedSession,
            matchesSinceLastInterstitial,
            nextInterstitialThreshold,
            lastInterstitialAt,
            lastMatchDurationSec,
        });
    },

    shouldShowInterstitial: () => {
        const {
            matchesSinceLastInterstitial,
            nextInterstitialThreshold,
            lastInterstitialAt,
            lastMatchDurationSec,
            matchOver,
        } = get();
        // Don't show after a loss — it adds insult to injury.
        if (matchOver?.result === 'loss') return false;
        // Don't show if the match was very short — the player wants to keep
        // playing right now; an ad would feel punitive.
        if (lastMatchDurationSec > 0 && lastMatchDurationSec < INTERSTITIAL_MIN_MATCH_SEC) {
            return false;
        }
        // Frequency cap.
        if (matchesSinceLastInterstitial < nextInterstitialThreshold) return false;
        // Cooldown.
        if (Date.now() - lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) return false;
        return true;
    },

    markInterstitialShown: () => {
        // Re-randomize the threshold for the next ad so cadence varies
        // between 3 and 4 matches.
        const next =
            INTERSTITIAL_EVERY_N_MIN +
            Math.floor(
                Math.random() * (INTERSTITIAL_EVERY_N_MAX - INTERSTITIAL_EVERY_N_MIN + 1)
            );
        set({
            lastInterstitialAt: Date.now(),
            matchesSinceLastInterstitial: 0,
            nextInterstitialThreshold: next,
        });
    },

    clearError: () => set({ lastError: null }),

    clearHintToast: () => set({ hintToast: null }),
}));
