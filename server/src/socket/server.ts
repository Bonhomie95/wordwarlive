// Socket.io server setup. Authentication happens at handshake — we expect
// `auth: { token: '<jwt>' }` from the client (Socket.io's `io({ auth })`).
// Sockets without a valid token are rejected.

import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { verifySession, type SessionToken } from '../auth/jwt.js';
import { logger } from '../utils/logger.js';
import type {
    ClientToServerEvents,
    ServerToClientEvents,
} from '../types/index.js';
import { matchmakingHub } from './matchmaking.js';
import { matchRegistry } from './matchHandler.js';

interface SocketData {
    session: SessionToken;
}

export type AppIOServer = IOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
>;

export type AppSocket = Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
>;

export function createSocketServer(http: HttpServer): AppIOServer {
    const io: AppIOServer = new IOServer(http, {
        cors: {
            origin: env.corsOrigins as string | string[],
            credentials: true,
        },
        // Keep the connection light — we don't need binary or large payloads.
        maxHttpBufferSize: 64 * 1024,
        // Heartbeat tuned for mobile networks. A ping every 25s and a 60s
        // tolerance means a player on a flaky connection won't get dropped
        // mid-match just because their packets paused for 30s during a
        // Wi-Fi → cellular handover.
        pingInterval: 25_000,
        pingTimeout: 60_000,
        // Allow long-polling as a fallback for clients on networks that
        // block websocket upgrades.
        transports: ['websocket', 'polling'],
        // Allow upgrading from polling to websocket (default true; explicit
        // for clarity).
        allowUpgrades: true,
    });

    io.use((socket, next) => {
        const tok = (socket.handshake.auth as { token?: string } | undefined)
            ?.token;
        if (!tok) return next(new Error('No token'));
        try {
            socket.data.session = verifySession(tok);
            next();
        } catch (err) {
            logger.warn({ err }, 'Socket handshake failed');
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        logger.info({ userId: socket.data.session.userId }, 'Socket connected');

        socket.on('queue_join', () => {
            matchmakingHub.enqueue(io, socket).catch((err) => {
                logger.error({ err }, 'queue_join failed');
                socket.emit('error', { message: 'Could not join queue' });
            });
        });

        socket.on('queue_leave', () => {
            matchmakingHub.leave(socket.data.session.userId);
        });

        socket.on('guess_submit', (payload, ack) => {
            matchRegistry
                .handleGuess(io, socket, payload.guess)
                .then(ack)
                .catch((err) => {
                    logger.error({ err }, 'guess_submit failed');
                    ack({ ok: false, error: 'Internal error' });
                });
        });

        socket.on('powerup_use', (payload, ack) => {
            matchRegistry
                .handlePowerUp(io, socket, payload.kind, payload.targetGuessIndex ?? null)
                .then(ack)
                .catch((err) => {
                    logger.error({ err }, 'powerup_use failed');
                    ack({ ok: false, error: 'Internal error' });
                });
        });

        socket.on('hint_request', (_payload, ack) => {
            matchRegistry
                .handleHint(socket)
                .then(ack)
                .catch((err) => {
                    logger.error({ err }, 'hint_request failed');
                    ack({
                        ok: false,
                        error: 'Internal error',
                        errorCode: 'GAME_NOT_ACTIVE',
                    });
                });
        });

        socket.on('match_resume', (_payload, ack) => {
            matchRegistry
                .handleResume(io, socket)
                .then(ack)
                .catch((err) => {
                    logger.error({ err }, 'match_resume failed');
                    ack({ ok: false, reason: 'Internal error' });
                });
        });

        socket.on('match_quit', (_payload, ack) => {
            matchRegistry
                .handleQuit(io, socket)
                .then(ack)
                .catch((err) => {
                    logger.error({ err }, 'match_quit failed');
                    ack({ ok: false, reason: 'Internal error' });
                });
        });

        socket.on('disconnect', (reason) => {
            logger.info({ userId: socket.data.session.userId, reason }, 'Socket disconnected');
            matchmakingHub.leave(socket.data.session.userId);
            matchRegistry.handleDisconnect(io, socket).catch((err) => {
                logger.error({ err }, 'disconnect cleanup failed');
            });
        });
    });

    return io;
}
