import { create } from 'zustand';
import { playSound } from '../lib/sound';
import { attention } from '../lib/haptics';
import {
    ensureSocket,
    disconnectSocket,
    getSocket,
    type AppSocket,
} from '../socket/client';
import type {
    GuessAck,
    GuessBroadcast,
    HintAck,
    MatchFound,
    MatchOver,
    QueueStatus,
    Tile,
    ChallengeAck,
    ChallengeMode,
} from '../types/index';

/** Guesses per player per match (the server enforces it too). */
export const MAX_GUESSES = 6;

/** Invites that reached this app (so a notification tap can tell a lapsed
 *  invite from one that was shown and answered). */
const shownChallengeIds = new Set<string>();
export const challengeWasShown = (id: string) => shownChallengeIds.has(id);

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
    /** Always null - server never reveals the opponent's letters mid-match. */
    guess: null;
    tiles: Tile[];
    solved: boolean;
}

/** A live challenge aimed at us (from a friend or the leaderboard). */
export interface IncomingChallenge {
    challengeId: string;
    fromUserId: string;
    fromUsername: string;
    mode: ChallengeMode;
    /** Mystery: our reply word must be this long. */
    wordLength?: number;
    /** ms epoch; older servers don't send it. */
    expiresAt?: number;
}
/** Our own outgoing challenge, waiting on the other player. */
export interface PendingChallenge {
    friendId: string;
    friendName: string;
    mode: ChallengeMode;
    expiresAt?: number;
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
    inputCells: (string | null)[];
    inputCursor: number;
    submitting: boolean;
    scrambled: boolean;
    lockedUntilMs: number | null;
    opponentEmoji: { emoji: string; at: number } | null;
    matchesPlayedSession: number;
    matchesSinceLastInterstitial: number;
    nextInterstitialThreshold: number;
    lastInterstitialAt: number;
    lastMatchDurationSec: number;
    hintsRevealed: Record<number, string>;
    freeHintAvailable: boolean;
    hintRequesting: boolean;
    hintToast: {
        position: number;
        letter: string;
        paidWith: 'free' | 'credit' | 'coins';
        coinsSpent: number;
    } | null;

    // ─── Friend-challenge state ──────────────────────────────────────────
    /** A friend just challenged us - drives the accept/decline prompt. */
    incomingChallenge: IncomingChallenge | null;
    /** We challenged a friend and are waiting on them - drives the
     *  "Waiting for X..." overlay on the Friends screen. */
    pendingChallenge: PendingChallenge | null;
    /** Transient message about a challenge result (declined / expired /
     *  cancelled). Shown once, then cleared. */
    challengeNotice: string | null;

    // ─── Actions ─────────────────────────────────────────────────────────
    /** Open (or reuse) the persistent socket and wire every listener.
     *  Called once after auth so friend challenges can reach us even when
     *  we're not queueing. Safe to call repeatedly. */
    connectPersistent: (token: string) => void;
    connectAndQueue: (token: string, mode?: 'classic' | 'mystery') => void;
    leaveQueue: () => void;
    /** Forfeit the active match. Opponent wins immediately. */
    quitMatch: () => void;
    /** Fire an emoji reaction at the opponent. Rate-limited server-side. */
    sendEmoji: (emoji: string) => void;
    /** Spend an earned power-up (reveal / scramble / lock). Resolves with the
     *  server ack so the caller can refresh inventory + surface errors. */
    activatePowerUp: (
        kind: 'reveal' | 'scramble' | 'lock'
    ) => Promise<{ ok: boolean; error?: string }>;
    appendLetter: (l: string) => void;
    backspace: () => void;
    clearInput: () => void;
    seekCursor: (position: number) => void;
    submitGuess: () => Promise<GuessAck | null>;
    requestHint: () => Promise<HintAck | null>;
    clearError: () => void;
    clearHintToast: () => void;
    shouldShowInterstitial: () => boolean;
    /** The game about to start ends on (or past) the interstitial threshold,
     *  so the ad should start loading now. */
    interstitialDueAfterThisGame: () => boolean;
    markInterstitialShown: () => void;
    reset: () => void;

    /** Join a friend's match by code. On success the match starts for both
     *  players and MatchAutoRouter opens the match screen. */
    joinPrivateMatch: (code: string) => Promise<{ ok: boolean; error?: string }>;
    /** Challenge a friend to a live match. Resolves with the server ack. */
    challengeFriend: (friendId: string, friendName: string) => Promise<ChallengeAck>;
    /** Challenge anyone (friend or leaderboard), Classic or Mystery. */
    sendChallenge: (targetId: string, targetName: string, mode: ChallengeMode, word?: string) => Promise<ChallengeAck>;
    /** Accept (with our Mystery word if it's a Mystery invite) or decline.
     *  On a refused accept the prompt stays up so the player can fix it. */
    respondToChallenge: (accept: boolean, word?: string) => Promise<{ ok: boolean; error?: string }>;
    /** Withdraw our own outgoing challenge. */
    cancelChallenge: () => void;
    /** Dismiss the transient challenge-result message. */
    clearChallengeNotice: () => void;
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
    lockedUntilMs: null as number | null,
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
    incomingChallenge: null as IncomingChallenge | null,
    pendingChallenge: null as PendingChallenge | null,
    challengeNotice: null as string | null,
};

const INTERSTITIAL_EVERY_N_MIN = 3;
const INTERSTITIAL_EVERY_N_MAX = 5;
const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;
const INTERSTITIAL_MIN_MATCH_SEC = 60;

type SetFn = (
    partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)
) => void;
type GetFn = () => GameState;

/**
 * Tracks which socket instance we've already attached listeners to.
 * Listeners are wired exactly ONCE per socket - the socket is now
 * persistent, so re-wiring on every queue would stack duplicate handlers.
 * After sign-out a fresh socket is created and re-wired.
 */
let wiredSocket: AppSocket | null = null;

/** Attach every server -> store listener. Idempotent per socket. */
function wireSocket(sock: AppSocket, set: SetFn, get: GetFn): void {
    if (wiredSocket === sock) return;
    wiredSocket = sock;

    sock.on('queue_status', (s) => {
        set({ queueStatus: s });
    });

    // Mystery mode uses its own status event with the same shape.
    sock.on('mystery_queue_status', (s: { state: string; waitedMs: number }) => {
        set({
            queueStatus: {
                state:
                    s.state === 'finalizing'
                        ? 'finalizing'
                        : 'searching',
                waitedMs: s.waitedMs,
            },
        });
    });

    sock.on('match_found', (m: MatchFound) => {
        // Ring and buzz so a player looking away notices. A resume replays
        // match_found for the same match, which stays quiet.
        if (get().matchFound?.matchId !== m.matchId) {
            playSound('matchFound');
            attention();
        }
        set({
            phase: 'matched',
            matchFound: m,
            msRemaining: m.durationSeconds * 1000,
            inputCells: new Array(m.wordLength).fill(null),
            inputCursor: 0,
            // A challenge that produced this match is now resolved.
            incomingChallenge: null,
            pendingChallenge: null,
        });
    });

    sock.on('match_start', () => {
        set({ phase: 'playing' });
    });

    sock.on('match_tick', ({ msRemaining }) => {
        set({ msRemaining });
    });

    sock.on('guess_result', (g: GuessBroadcast) => {
        // Place each guess at its row. Coming back to the app replays the
        // whole history, and appending repeated old guesses into empty rows.
        const placed = <T,>(list: T[], item: T): T[] => {
            const next = list.slice();
            next[Math.min(g.guessIndex, list.length)] = item;
            return next;
        };
        // A sound only for a row we haven't seen (a resume replays them all).
        const seen = (g.side === 'me' ? get().myGuesses : get().oppGuesses)[g.guessIndex];
        if (!seen) playSound(g.side === 'me' ? 'guess' : 'opponent');
        if (g.side === 'me') {
            set((s) => ({
                myGuesses: placed(s.myGuesses, { guess: g.guess ?? '', tiles: g.tiles, solved: g.solved }),
                inputCells: s.matchFound
                    ? new Array(s.matchFound.wordLength).fill(null)
                    : [],
                inputCursor: 0,
                submitting: false,
            }));
        } else {
            set((s) => ({
                oppGuesses: placed(s.oppGuesses, { guess: null, tiles: g.tiles, solved: g.solved }),
            }));
        }
    });

    sock.on('match_over', (mo: MatchOver) => {
        set((s) => ({
            phase: 'finished',
            matchOver: mo,
            matchesPlayedSession: s.matchesPlayedSession + 1,
            matchesSinceLastInterstitial: s.matchesSinceLastInterstitial + 1,
            lastMatchDurationSec: mo.matchDurationSec ?? 0,
        }));
    });

    // Also discover a live match after a cold app start, when local state is idle.
    const resume = (attempt = 0) => {
        const phase = get().phase;
        if (!['idle', 'playing', 'matched'].includes(phase)) return;
        const wasActive = phase !== 'idle';
        sock.timeout(8000).emit('match_resume', {}, (err: Error | null, ack: {ok:boolean;reason?:string} = {ok:false}) => {
            if (err) {
                if (attempt < 2) setTimeout(() => { if (sock.connected) resume(attempt + 1); }, 1500);
                else if (wasActive) set({lastError:'Connection interrupted. Return to the app to retry.'});
                return;
            }
            if (!ack.ok && wasActive) set({phase:'idle',lastError:'Match ended while you were away. Check match history for your result.'});
        });
    };
    sock.on('connect', () => resume());
    if (sock.connected) resume();

    sock.on('opponent_scramble', () => {
        playSound('powerUp');
        set({ scrambled: true });
        setTimeout(() => set({ scrambled: false }), 1500);
    });

    sock.on(
        'powerup_reveal_letter',
        (payload: { position: number; letter: string }) => {
            set((s) => ({
                hintsRevealed: {
                    ...s.hintsRevealed,
                    [payload.position]: payload.letter,
                },
            }));
        }
    );

    sock.on('powerup_locked', (payload) => {
        playSound('powerUp');
        set({ lockedUntilMs: Date.now() + payload.durationMs });
    });

    sock.on('opponent_emoji', (payload: { emoji: string }) => {
        playSound('opponent');
        set({ opponentEmoji: { emoji: payload.emoji, at: Date.now() } });
        setTimeout(() => set({ opponentEmoji: null }), 2500);
    });

    sock.on('error', (e) => {
        set({ lastError: e.message });
    });

    sock.on('server_restarting', () => {
        // Surface a gentle notice. In-flight matches are given a grace window
        // server-side to finish; queued players are told to retry shortly.
        const phase = get().phase;
        if (phase === 'queueing') {
            set({
                phase: 'idle',
                queueStatus: null,
                challengeNotice: 'Server is updating — try again in a moment.',
            });
        }
    });

    // ─── Friend challenges ───────────────────────────────────────────────
    const showIncoming = (c: IncomingChallenge) => {
        shownChallengeIds.add(c.challengeId);
        // Can't accept while mid-match - ignore the prompt entirely. The same
        // invite can arrive twice (live, then again on reconnect): ring once.
        const phase = get().phase;
        if (phase === 'playing' || phase === 'matched') return;
        if (get().incomingChallenge?.challengeId === c.challengeId) return;
        playSound('matchFound');
        attention();
        set({ incomingChallenge: c });
    };
    // Count down on our own clock: the phone's and server's can disagree.
    const localExpiry = (p: { expiresAt?: number; expiresInMs?: number }) =>
        p.expiresInMs != null ? Date.now() + p.expiresInMs : p.expiresAt;
    sock.on('friend_challenge_incoming', (payload) =>
        showIncoming({ ...payload, mode: 'classic', expiresAt: localExpiry(payload) })
    );
    sock.on('mystery_challenge_incoming', (payload) =>
        showIncoming({ ...payload, mode: 'mystery', expiresAt: localExpiry(payload) })
    );

    sock.on('friend_challenge_declined', () => {
        const name = get().pendingChallenge?.friendName;
        set({
            pendingChallenge: null,
            challengeNotice: `${name ?? 'They'} declined the challenge.`,
        });
    });

    sock.on('friend_challenge_cancelled', (payload) => {
        const pending = get().pendingChallenge;
        const name = pending?.friendName ?? 'They';
        // Worded for whichever side we're on: our invite, or one sent to us.
        const reasonText: Record<string, string> = pending
            ? {
                  cancelled: 'The challenge was cancelled.',
                  expired: `${name} didn't answer in time.`,
                  offline: `${name} went offline.`,
                  busy: 'A player is already in a match.',
              }
            : {
                  cancelled: 'The challenger withdrew.',
                  expired: 'The challenge expired.',
                  offline: 'The challenger went offline.',
                  busy: 'A player is already in a match.',
              };
        set({
            pendingChallenge: null,
            incomingChallenge: null,
            challengeNotice: reasonText[payload.reason] ?? 'Challenge cancelled.',
        });
    });
}

export const useGameStore = create<GameState>((set, get) => ({
    ...initial,
    matchesPlayedSession: 0,
    matchesSinceLastInterstitial: 0,
    nextInterstitialThreshold:
        INTERSTITIAL_EVERY_N_MIN +
        Math.floor(Math.random() * (INTERSTITIAL_EVERY_N_MAX - INTERSTITIAL_EVERY_N_MIN + 1)),
    lastInterstitialAt: 0,
    lastMatchDurationSec: 0,

    connectPersistent: (token) => {
        // Open the session-long socket (if not already open) and make sure
        // every listener is attached. Called right after auth.
        wireSocket(ensureSocket(token), set, get);
    },

    connectAndQueue: (token, mode = 'classic') => {
        // Reset transient match state for a fresh game. Counters and
        // challenge state are intentionally left alone here.
        set({
            phase: 'queueing',
            queueStatus: null,
            matchFound: null,
            msRemaining: 0,
            myGuesses: [],
            oppGuesses: [],
            matchOver: null,
            lastError: null,
            inputCells: [],
            inputCursor: 0,
            submitting: false,
            scrambled: false,
            lockedUntilMs: null,
            opponentEmoji: null,
            hintsRevealed: {},
            freeHintAvailable: true,
            hintRequesting: false,
            hintToast: null,
        });

        // Reuse the persistent socket - never tear it down + rebuild. The
        // server cleans up finished-match state, so a fresh queue_join on
        // the same socket works every time.
        const sock = ensureSocket(token);
        wireSocket(sock, set, get);

        const fireQueue = () => {
            // The socket may connect AFTER the user already backed out
            // (cancelled the queue). Only actually queue if we're still in
            // the queueing phase.
            if (get().phase !== 'queueing') return;
            if (mode === 'mystery') {
                sock.emit('mystery_queue', {}, (resp) => {
                    if (!resp.ok) {
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

        // Queue once the socket is actually connected. `.once` auto-removes
        // so repeated connectAndQueue calls can't stack queue handlers.
        if (sock.connected) fireQueue();
        else sock.once('connect', fireQueue);
    },

    leaveQueue: () => {
        const sock = getSocket();
        // Emit both - the server ignores the irrelevant one.
        sock?.emit('queue_leave');
        sock?.emit('mystery_leave', {});
        set({ phase: 'idle', queueStatus: null });
    },

    quitMatch: () => {
        const sock = getSocket();
        if (!sock) return;
        sock.emit('match_quit', {}, () => {
            // match_over handles the UI transition.
        });
    },

    sendEmoji: (emoji) => {
        const sock = getSocket();
        sock?.emit('emoji_send', { emoji });
    },

    activatePowerUp: (kind) => {
        const { phase, lockedUntilMs } = get();
        if (phase !== 'playing') {
            return Promise.resolve({ ok: false, error: 'Match not active' });
        }
        if (lockedUntilMs && Date.now() < lockedUntilMs) {
            return Promise.resolve({
                ok: false,
                error: 'Your powerups are locked.',
            });
        }
        const sock = getSocket();
        if (!sock) return Promise.resolve({ ok: false, error: 'Not connected' });
        return new Promise((resolve) => {
            sock.timeout(8000).emit(
                'powerup_use',
                { kind },
                (
                    err: Error | null,
                    ack: { ok: boolean; error?: string } = {
                        ok: false,
                        error: 'Timed out',
                    }
                ) => {
                    if (err) {
                        resolve({ ok: false, error: 'Network timeout' });
                        return;
                    }
                    if (!ack.ok && ack.error) set({ lastError: ack.error });
                    resolve(ack);
                }
            );
        });
    },

    appendLetter: (l) => {
        const { inputCells, inputCursor, matchFound, phase, myGuesses } = get();
        if (phase !== 'playing' || !matchFound || myGuesses.length >= MAX_GUESSES) return;
        if (inputCursor >= matchFound.wordLength) return;
        const ch = l.toUpperCase();
        if (!/^[A-Z]$/.test(ch)) return;

        const next = [...inputCells];
        next[inputCursor] = ch;

        let nextCursor = inputCursor + 1;
        while (nextCursor < matchFound.wordLength && next[nextCursor] !== null) {
            nextCursor += 1;
        }
        set({ inputCells: next, inputCursor: nextCursor });
    },

    backspace: () => {
        const { inputCells, inputCursor, matchFound } = get();
        if (!matchFound) return;
        const cells = [...inputCells];

        let pos = inputCursor;
        if (pos >= matchFound.wordLength) pos = matchFound.wordLength - 1;

        if (cells[pos] !== null) {
            cells[pos] = null;
            set({ inputCells: cells, inputCursor: pos });
        } else if (pos > 0) {
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
        const { inputCells, matchFound, phase, submitting, myGuesses } = get();
        if (phase !== 'playing' || !matchFound || myGuesses.length >= MAX_GUESSES) return null;
        if (submitting) return null;
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
        // NOTE: we no longer disconnect the socket here. The socket is a
        // session-long singleton (needed for friend challenges + so the
        // next match can queue instantly). Only sign-out tears it down.
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
        } = get();
        if (lastMatchDurationSec > 0 && lastMatchDurationSec < INTERSTITIAL_MIN_MATCH_SEC) {
            return false;
        }
        if (matchesSinceLastInterstitial < nextInterstitialThreshold) return false;
        if (Date.now() - lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) return false;
        return true;
    },

    interstitialDueAfterThisGame: () => {
        const { matchesSinceLastInterstitial, nextInterstitialThreshold } = get();
        return matchesSinceLastInterstitial + 1 >= nextInterstitialThreshold;
    },

    markInterstitialShown: () => {
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

    // ─── Friend-challenge actions ────────────────────────────────────────
    joinPrivateMatch: (code) => {
        const sock = getSocket();
        if (!sock) return Promise.resolve({ ok: false, error: 'Not connected. Try again in a moment.' });
        return new Promise((resolve) => {
            sock.timeout(10_000).emit(
                'private_join',
                { code },
                (err: Error | null, resp: { ok: boolean; error?: string } = { ok: false }) => {
                    resolve(err ? { ok: false, error: 'Network timeout.' } : resp);
                }
            );
        });
    },

    challengeFriend: (friendId, friendName) => get().sendChallenge(friendId, friendName, 'classic'),

    sendChallenge: (targetId, targetName, mode, word) => {
        const sock = getSocket();
        if (!sock) {
            return Promise.resolve({ ok: false as const, error: 'Not connected. Try again in a moment.' });
        }
        return new Promise<ChallengeAck>((resolve) => {
            sock.timeout(10_000).emit(
                'challenge_send',
                { targetId, mode, ...(word ? { word } : {}) },
                (err: Error | null, resp: ChallengeAck = { ok: false, error: 'Timed out' }) => {
                    if (err) {
                        resolve({ ok: false, error: 'Network timeout.' });
                        return;
                    }
                    if (resp.ok) {
                        set({
                            pendingChallenge: {
                                friendId: targetId,
                                friendName: targetName,
                                mode,
                                expiresAt: resp.expiresInMs != null ? Date.now() + resp.expiresInMs : resp.expiresAt,
                            },
                            challengeNotice: null,
                        });
                    }
                    resolve(resp);
                }
            );
        });
    },

    respondToChallenge: (accept, word) => {
        const sock = getSocket();
        const challenge = get().incomingChallenge;
        if (!sock || !challenge) {
            set({ incomingChallenge: null });
            return Promise.resolve({ ok: false, error: 'Not connected.' });
        }
        // A decline closes the prompt at once; an accept waits for the server
        // (a refused Mystery word keeps the prompt so it can be fixed).
        if (!accept) set({ incomingChallenge: null });
        return new Promise((resolve) => {
            sock.timeout(10_000).emit(
                'friend_challenge_respond',
                { challengeId: challenge.challengeId, accept, ...(word ? { word } : {}) },
                (err: Error | null, resp: { ok: boolean; error?: string } = { ok: true }) => {
                    if (err) {
                        resolve({ ok: false, error: 'Network timeout.' });
                        return;
                    }
                    if (accept && resp.ok) set({ incomingChallenge: null });
                    // Gone for good (expired, challenger left): close and say why.
                    if (accept && !resp.ok && !/word|letter/i.test(resp.error ?? '')) {
                        set({ incomingChallenge: null, challengeNotice: resp.error ?? 'Could not start the match.' });
                    }
                    resolve(resp);
                }
            );
        });
    },

    cancelChallenge: () => {
        const sock = getSocket();
        sock?.emit('friend_challenge_cancel', {});
        set({ pendingChallenge: null });
    },

    clearChallengeNotice: () => set({ challengeNotice: null }),
}));

// Re-exported for callers that still import it (e.g. sign-out cleanup).
export { disconnectSocket };
