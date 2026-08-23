// Friend challenges — the real-time "play with friends" flow.
//
// Unlike private-match codes (share a string, friend types it in later),
// a challenge is a live invite: A taps a friend on their list, B gets a
// push prompt right then, and if B accepts the match starts immediately.
// Both players land in the normal match flow (match_found / match_start),
// so the VS splash + match screen are identical to ranked play.
//
// State is in-memory and single-node, same as presence/matchmaking. A
// challenge lives at most CHALLENGE_TTL_MS before it auto-expires.

import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { matchRegistry } from './matchHandler.js';
import { socketIdFor } from './presence.js';
import { findUserById } from '../services/userService.js';
import { areFriends } from '../services/friendsService.js';
import { sendPushToUser } from '../services/pushService.js';
import { pickRankAwareWord } from '../game/words.js';
import type { AppIOServer, AppSocket } from './server.js';

/** A challenge auto-expires if the friend doesn't respond in time. */
const CHALLENGE_TTL_MS = 45_000;

interface PendingChallenge {
    id: string;
    fromUserId: string;
    toUserId: string;
    createdAt: number;
    expiry: NodeJS.Timeout;
}

class FriendChallengeHub {
    private byId = new Map<string, PendingChallenge>();
    /** fromUserId -> challengeId. One outgoing challenge per user. */
    private byFrom = new Map<string, string>();

    /** A taps "challenge" on friend B. Validates and pushes the prompt. */
    async challenge(
        io: AppIOServer,
        socket: AppSocket,
        friendId: string
    ): Promise<{ ok: true; challengeId: string } | { ok: false; error: string }> {
        const fromId = socket.data.session.userId;
        if (!friendId || fromId === friendId) {
            return { ok: false, error: "You can't challenge yourself." };
        }
        if (!(await areFriends(fromId, friendId))) {
            return { ok: false, error: 'They are not in your friends list.' };
        }
        if (matchRegistry.isInMatch(fromId)) {
            return { ok: false, error: "You're already in a match." };
        }
        if (matchRegistry.isInMatch(friendId)) {
            return { ok: false, error: 'Your friend is already in a match.' };
        }
        const friendSocketId = await socketIdFor(friendId);
        if (!friendSocketId) {
            return { ok: false, error: 'Your friend is offline.' };
        }
        // Live friend challenges need both players on the same node (the match
        // runtime is node-local). If they're on different instances, fail fast
        // with a helpful message rather than after they accept.
        if (!io.sockets.sockets.has(friendSocketId)) {
            return {
                ok: false,
                error: "You and your friend are on different game servers right now. Try a private match code instead.",
            };
        }

        const [me, friend] = await Promise.all([
            findUserById(fromId),
            findUserById(friendId),
        ]);
        if (!me || !friend) return { ok: false, error: 'User not found.' };

        // Replace any earlier outgoing challenge from this user.
        await this.clearOutgoing(io, fromId, 'cancelled');

        const id = randomUUID();
        const challenge: PendingChallenge = {
            id,
            fromUserId: fromId,
            toUserId: friendId,
            createdAt: Date.now(),
            expiry: setTimeout(() => {
                this.expire(io, id).catch((err) =>
                    logger.error({ err }, 'friend challenge expire failed')
                );
            }, CHALLENGE_TTL_MS),
        };
        this.byId.set(id, challenge);
        this.byFrom.set(fromId, id);

        io.to(friendSocketId).emit('friend_challenge_incoming', {
            challengeId: id,
            fromUserId: fromId,
            fromUsername: me.username,
        });
        // Also push — reaches the friend if their app is backgrounded even
        // though the socket is still (briefly) connected. Best-effort.
        sendPushToUser(friendId, {
            title: 'Word War',
            body: `${me.username} challenged you to a match!`,
            data: { type: 'friend_challenge', challengeId: id, fromUserId: fromId },
        }).catch(() => {});
        logger.info({ fromId, friendId, id }, 'friend challenge sent');
        return { ok: true, challengeId: id };
    }

    /** B accepts or declines. On accept we kick off a real match. */
    async respond(
        io: AppIOServer,
        socket: AppSocket,
        challengeId: string,
        accept: boolean
    ): Promise<{ ok: boolean; error?: string }> {
        const challenge = this.byId.get(challengeId);
        if (!challenge) return { ok: false, error: 'Challenge expired.' };
        if (challenge.toUserId !== socket.data.session.userId) {
            return { ok: false, error: 'Not your challenge.' };
        }
        this.dispose(challenge);

        const fromSocketId = await socketIdFor(challenge.fromUserId);

        if (!accept) {
            if (fromSocketId) {
                io.to(fromSocketId).emit('friend_challenge_declined', {
                    byUserId: challenge.toUserId,
                });
            }
            return { ok: true };
        }

        if (!fromSocketId) {
            return { ok: false, error: 'The challenger went offline.' };
        }
        // Both sockets must be on THIS node for the match runtime to work
        // (see startMatch's co-location guard). The responder (socket) is
        // local by definition; verify the challenger is too.
        if (!io.sockets.sockets.has(fromSocketId)) {
            io.to(fromSocketId).emit('friend_challenge_cancelled', {
                reason: 'busy',
            });
            return {
                ok: false,
                error: "You and your friend are on different game servers right now. Try a private match code instead.",
            };
        }
        if (
            matchRegistry.isInMatch(challenge.fromUserId) ||
            matchRegistry.isInMatch(challenge.toUserId)
        ) {
            if (fromSocketId) {
                io.to(fromSocketId).emit('friend_challenge_cancelled', {
                    reason: 'busy',
                });
            }
            return { ok: false, error: 'A player is already in a match.' };
        }

        const [host, joiner] = await Promise.all([
            findUserById(challenge.fromUserId),
            findUserById(challenge.toUserId),
        ]);
        if (!host || !joiner) return { ok: false, error: 'User not found.' };

        const word = pickRankAwareWord(
            Math.max(host.rank_points, joiner.rank_points)
        );
        await matchRegistry.startMatch(io, {
            p1SocketId: fromSocketId,
            p2SocketId: socket.id,
            p1UserId: host.id,
            p2UserId: joiner.id,
            p1IsBot: false,
            p2IsBot: false,
            explicitWord: word,
            mode: 'classic',
        });
        logger.info(
            { from: host.id, to: joiner.id, id: challengeId },
            'friend challenge accepted -> match started'
        );
        return { ok: true };
    }

    /** A cancels their own outgoing challenge before B responds. */
    cancel(io: AppIOServer, socket: AppSocket): void {
        this.clearOutgoing(io, socket.data.session.userId, 'cancelled').catch(
            (err) => logger.error({ err }, 'clearOutgoing (cancel) failed')
        );
    }

    /** A socket dropped — tear down anything that involved that user. */
    async handleDisconnect(io: AppIOServer, userId: string): Promise<void> {
        // Any outgoing challenge from them.
        await this.clearOutgoing(io, userId, 'offline');
        // Any incoming challenge aimed at them.
        for (const challenge of [...this.byId.values()]) {
            if (challenge.toUserId === userId) {
                this.dispose(challenge);
                const fromSocketId = await socketIdFor(challenge.fromUserId);
                if (fromSocketId) {
                    io.to(fromSocketId).emit('friend_challenge_cancelled', {
                        reason: 'offline',
                    });
                }
            }
        }
    }

    // ─── internals ───────────────────────────────────────────────────────

    private async expire(io: AppIOServer, challengeId: string): Promise<void> {
        const challenge = this.byId.get(challengeId);
        if (!challenge) return;
        this.dispose(challenge);
        for (const userId of [challenge.fromUserId, challenge.toUserId]) {
            const sid = await socketIdFor(userId);
            if (sid) {
                io.to(sid).emit('friend_challenge_cancelled', {
                    reason: 'expired',
                });
            }
        }
    }

    private async clearOutgoing(
        io: AppIOServer,
        fromUserId: string,
        reason: 'cancelled' | 'offline'
    ): Promise<void> {
        const id = this.byFrom.get(fromUserId);
        if (!id) return;
        const challenge = this.byId.get(id);
        if (challenge) {
            this.dispose(challenge);
            const toSocketId = await socketIdFor(challenge.toUserId);
            if (toSocketId) {
                io.to(toSocketId).emit('friend_challenge_cancelled', { reason });
            }
        }
    }

    private dispose(challenge: PendingChallenge): void {
        clearTimeout(challenge.expiry);
        this.byId.delete(challenge.id);
        if (this.byFrom.get(challenge.fromUserId) === challenge.id) {
            this.byFrom.delete(challenge.fromUserId);
        }
    }
}

export const friendChallengeHub = new FriendChallengeHub();
