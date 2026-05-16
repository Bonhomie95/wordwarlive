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
 * Connect (or reuse) the singleton Socket.io client. Built for mobile networks
 * which are often slow, switch between Wi-Fi/cellular, and drop briefly when
 * the app is backgrounded.
 *
 * Resilience knobs:
 *   - `transports: ['websocket', 'polling']` — websocket is preferred but we
 *     fall back to long-polling automatically on networks that block WS
 *     upgrades (some corporate proxies, some cellular carriers in Lagos).
 *   - `reconnectionAttempts: Infinity` — never give up. Mobile networks come
 *     and go; making the user manually re-tap a button is the wrong UX.
 *   - Exponential backoff capped at 10 s so we don't thrash the server but
 *     also don't make the user wait forever once their connection is back.
 *   - 30 s connection timeout — generous enough for slow 3G handshakes.
 *   - When the app comes back to the foreground, we force a reconnect
 *     attempt so the user doesn't have to wait for the socket's internal
 *     heartbeat to notice the network changed.
 */
/**
 * Create a fresh singleton Socket.io client. ALWAYS tears down any
 * previous socket completely first — we do not reuse a connected socket,
 * because a socket left over from a finished match still carries that
 * match's server-side state, and reusing it means the next queue_join is
 * silently ignored (the "have to reload to play again" bug).
 */
export function connectSocket(token: string): AppSocket {
    // Fully dispose any existing socket — remove every listener and kill
    // the underlying manager so it can't auto-reconnect in the background.
    if (socket) {
        socket.removeAllListeners();
        socket.io.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
    if (appStateSub) {
        appStateSub.remove();
        appStateSub = null;
    }

    socket = io(apiUrl, {
        auth: { token },
        // Polling fallback for environments that block websocket upgrades.
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000,
        randomizationFactor: 0.5,
        // Slow network tolerance — Lagos cellular handshakes can run long.
        timeout: 30_000,
        // Fresh connection every time — never reuse a manager.
        forceNew: true,
    });

    // Surface meaningful events for debugging.
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

    // Force a reconnect attempt when the app returns to the foreground.
    appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active' && socket && !socket.connected) {
            socket.connect();
        }
    });

    return socket;
}

export function getSocket(): AppSocket | null {
    return socket;
}

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
