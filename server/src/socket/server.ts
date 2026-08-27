// Socket.io server setup. Authentication happens at handshake — we expect
// `auth: { token: '<jwt>' }` from the client (Socket.io's `io({ auth })`).
// Sockets without a valid token are rejected.

import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from '../db/redis.js';
import { env } from '../config/env.js';
import { verifySession, type SessionToken } from '../auth/jwt.js';
import { logger } from '../utils/logger.js';
import type {
    ClientToServerEvents,
    ServerToClientEvents,
} from '../types/index.js';
import { matchmakingHub } from './matchmaking.js';
import { matchRegistry } from './matchHandler.js';
import { mysteryHub } from './mysteryMatchmaking.js';
import { friendChallengeHub } from './friendChallenge.js';
import { getMyPendingSubmission } from '../services/mysteryService.js';
import { markOffline, markOnline, socketIdFor } from './presence.js';
import {
    consumePrivateMatchCode,
    resolvePrivateMatchCode,
} from '../services/friendsService.js';
import { pickRankAwareWord, pickRandomWord } from '../game/words.js';
import { findUserById, getSessionState } from '../services/userService.js';
import {
    parse,
    guessSubmitSchema,
    powerUpSchema,
    emojiSchema,
    privateJoinSchema,
    friendChallengeSchema,
    friendChallengeRespondSchema,
} from './validate.js';
import { isShuttingDown } from './drain.js';

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

    // Redis adapter — lets `io.to(socketId).emit(...)` reach a socket that is
    // connected to a DIFFERENT server instance. This makes presence-driven
    // features (friend challenges, private-match invites) correct across a
    // multi-node deployment. NOTE: the live match RUNTIME (timers, guess
    // handling, in-memory match state) is still node-local, so the load
    // balancer must route a given user consistently to one node (sticky
    // sessions) and matchmaking co-locates a pair on the enqueuing node.
    // See DEPLOYMENT.md "Scaling".
    const pubClient = redis;
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));

    io.use(async (socket, next) => {
        const tok = (socket.handshake.auth as { token?: string } | undefined)
            ?.token;
        if (!tok) return next(new Error('No token'));
        try {
            const session = verifySession(tok);
            // Reject revoked or banned sessions (see requireAuth for rationale).
            const state = await getSessionState(session.userId);
            if (state === null || state.tokenVersion !== session.tokenVersion) {
                return next(new Error('Session expired'));
            }
            if (state.banned) {
                return next(new Error('Account suspended'));
            }
            socket.data.session = session;
            next();
        } catch (err) {
            logger.warn({ err }, 'Socket handshake failed');
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        logger.info({ userId: socket.data.session.userId }, 'Socket connected');
        markOnline(socket.data.session.userId, socket.id).catch(() => {});

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
            const data = parse(guessSubmitSchema, payload);
            if (!data) {
                ack({ ok: false, error: 'Invalid guess', errorCode: 'NON_ALPHABETIC' });
                return;
            }
            matchRegistry
                .handleGuess(io, socket, data.guess)
                .then(ack)
                .catch((err) => {
                    logger.error({ err }, 'guess_submit failed');
                    ack({ ok: false, error: 'Internal error' });
                });
        });

        socket.on('powerup_use', (payload, ack) => {
            const data = parse(powerUpSchema, payload);
            if (!data) {
                ack({ ok: false, error: 'Invalid powerup request' });
                return;
            }
            matchRegistry
                .handlePowerUp(io, socket, data.kind, data.targetGuessIndex ?? null)
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

        socket.on('emoji_send', (payload) => {
            // No ack — fire and forget. Errors logged only.
            const data = parse(emojiSchema, payload);
            if (!data) return;
            matchRegistry
                .handleEmoji(io, socket, data.emoji)
                .catch((err) => logger.error({ err }, 'emoji_send failed'));
        });

        socket.on('mystery_queue', async (_payload, ack) => {
            try {
                if (isShuttingDown()) {
                    ack({ ok: false, error: 'Server is restarting — try again in a moment.' });
                    return;
                }
                // Require a pending submission first.
                const userId = socket.data.session.userId;
                const sub = await getMyPendingSubmission(userId);
                if (!sub) {
                    ack({
                        ok: false,
                        error: 'Submit a mystery word first.',
                    });
                    return;
                }
                mysteryHub.setIo(io);
                mysteryHub.enqueue(socket);
                ack({ ok: true });
                // Run an immediate tick so a same-length opponent waiting
                // gets matched without a 3s delay.
                mysteryHub.tick(io).catch(() => {});
            } catch (err) {
                logger.error({ err }, 'mystery_queue failed');
                ack({ ok: false, error: 'Internal error' });
            }
        });

        socket.on('mystery_leave', () => {
            mysteryHub.leave(socket.data.session.userId);
        });

        // ─── Friend challenges (live "play with friends") ────────────────
        socket.on('friend_challenge', async (payload, ack) => {
            try {
                const data = parse(friendChallengeSchema, payload);
                if (!data) {
                    ack({ ok: false, error: 'Invalid friend id' });
                    return;
                }
                const friendId = data.friendId;
                const resp = await friendChallengeHub.challenge(
                    io,
                    socket,
                    friendId
                );
                ack(resp);
            } catch (err) {
                logger.error({ err }, 'friend_challenge failed');
                ack({ ok: false, error: 'Internal error' });
            }
        });

        socket.on('friend_challenge_respond', async (payload, ack) => {
            try {
                const data = parse(friendChallengeRespondSchema, payload);
                if (!data) {
                    ack({ ok: false, error: 'Invalid challenge response' });
                    return;
                }
                const resp = await friendChallengeHub.respond(
                    io,
                    socket,
                    data.challengeId,
                    data.accept
                );
                ack(resp);
            } catch (err) {
                logger.error({ err }, 'friend_challenge_respond failed');
                ack({ ok: false, error: 'Internal error' });
            }
        });

        socket.on('friend_challenge_cancel', () => {
            friendChallengeHub.cancel(io, socket);
        });

        socket.on('private_join', async (payload, ack) => {
            try {
                const data = parse(privateJoinSchema, payload);
                if (!data) return ack({ ok: false, error: 'Missing code' });
                const code = data.code.toUpperCase();

                const resolved = await resolvePrivateMatchCode(code);
                if (!resolved) {
                    return ack({ ok: false, error: 'Invalid or expired code.' });
                }
                if (resolved.hostId === socket.data.session.userId) {
                    return ack({ ok: false, error: "That's your own code." });
                }

                const hostSocketId = await socketIdFor(resolved.hostId);
                if (!hostSocketId) {
                    return ack({ ok: false, error: 'Host is offline.' });
                }
                // Both sockets must be on this node (node-local match runtime).
                if (!io.sockets.sockets.has(hostSocketId)) {
                    return ack({
                        ok: false,
                        error: 'The host is on a different game server. Ask them to create a new code and retry.',
                    });
                }

                const [host, joiner] = await Promise.all([
                    findUserById(resolved.hostId),
                    findUserById(socket.data.session.userId),
                ]);
                if (!host || !joiner) {
                    return ack({ ok: false, error: 'User not found.' });
                }

                // Word: explicit length if specified, else rank-aware.
                const word =
                    resolved.wordLength != null
                        ? pickRandomWord(resolved.wordLength)
                        : pickRankAwareWord(
                              Math.max(host.rank_points, joiner.rank_points)
                          );

                await consumePrivateMatchCode(code);
                await matchRegistry.startMatch(io, {
                    p1SocketId: hostSocketId,
                    p2SocketId: socket.id,
                    p1UserId: host.id,
                    p2UserId: joiner.id,
                    p1IsBot: false,
                    p2IsBot: false,
                    explicitWord: word,
                    mode: 'classic',
                });
                ack({ ok: true });
            } catch (err) {
                logger.error({ err }, 'private_join failed');
                ack({ ok: false, error: 'Internal error' });
            }
        });

        socket.on('disconnect', (reason) => {
            logger.info({ userId: socket.data.session.userId, reason }, 'Socket disconnected');
            markOffline(socket.id).catch(() => {});
            matchmakingHub.leave(socket.data.session.userId);
            mysteryHub.leave(socket.data.session.userId);
            friendChallengeHub
                .handleDisconnect(io, socket.data.session.userId)
                .catch((err) => logger.error({ err }, 'friend challenge disconnect cleanup failed'));
            matchRegistry.handleDisconnect(io, socket).catch((err) => {
                logger.error({ err }, 'disconnect cleanup failed');
            });
        });
    });

    return io;
}
