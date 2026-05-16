import { io, type Socket } from 'socket.io-client';
import { AppState, type AppStateStatus } from 'react-native';
import { apiUrl } from '../api/client';
import type {
    ClientToServerEvents,
    ServerToClientEvents,
} from '../types/index';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;
let appStateSub: { remove: () => void } | null = null;

/**
 * The socket is now a PERSISTENT, session-long singleton, not a per-match
 * throwaway.
 *
 * Why this changed:
 *   1. The old code tore the socket down and built a brand-new one on
 *      every queue. Combined with expo-router keeping the matchmaking
 *      screen mounted, that's what caused "the 2nd game never connects /
 *      Play Again bounces home" - see matchmaking.tsx.
 *   2. Friend challenges need the socket alive whenever the app is open,
 *      so a friend's invite can actually reach you. A socket that only
 *      exists mid-queue can't receive anything.
 *
 * The server already cleans up all per-match state when a match ends
 * (matchHandler.endMatch deletes the byUserId/byMatchId entries), so
 * re-using one connected socket for many matches is safe - a fresh
 * `queue_join` is never swallowed.
 */
export function ensureSocket(token: string): AppSocket {
    // Re-use the live socket if we already have one. socket.io handles its
    // own reconnection internally, so we never recreate it.
    if (socket) return socket;

    socket = io(apiUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000,
        randomizationFactor: 0.5,
        timeout: 30_000,
    });

    socket.on('connect', () => {
        // eslint-disable-next-line no-console
        console.log('[socket] connected', socket?.id);
    });
    socket.on('connect_error', (err) => {
        // eslint-disable-next-line no-console
        console.warn('[socket] connect_error', err.message);
    });
    socket.io.on('reconnect_attempt', (n: number) => {
        // eslint-disable-next-line no-console
        console.log('[socket] reconnect_attempt', n);
    });
    socket.on('disconnect', (reason) => {
        // eslint-disable-next-line no-console
        console.log('[socket] disconnect', reason);
    });

    // Nudge a reconnect when the app returns to the foreground so the user
    // doesn't wait for the heartbeat to notice a network change.
    appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active' && socket && !socket.connected) {
            socket.connect();
        }
    });

    return socket;
}

/**
 * Back-compat alias. Older call-sites said `connectSocket`; the behaviour
 * is now "ensure the persistent socket exists", which is what they all
 * actually wanted.
 */
export const connectSocket = ensureSocket;

export function getSocket(): AppSocket | null {
    return socket;
}

/**
 * Fully dispose the socket. Only call this on SIGN OUT - not between
 * matches. Killing it between matches is exactly the bug we're fixing.
 */
export function disconnectSocket(): void {
    if (appStateSub) {
        appStateSub.remove();
        appStateSub = null;
    }
    if (socket) {
        socket.removeAllListeners();
        socket.io.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
}
