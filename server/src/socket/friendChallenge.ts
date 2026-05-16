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
        const friendSocketId = socketIdFor(friendId);
        if (!friendSocketId) {
            return { ok: false, error: 'Your friend is offline.' };
        }

        const [me, friend] = await Promise.all([
            findUserById(fromId),
            findUserById(friendId),
        ]);
        if (!me || !friend) return { ok: false, error: 'User not found.' };

        // Replace any earlier outgoing challenge from this user.
        this.clearOutgoing(io, fromId, 'cancelled');

        const id = randomUUID();
        const challenge: PendingChallenge = {
            id,
            fromUserId: fromId,
            toUserId: friendId,
            createdAt: Date.now(),
            expiry: setTimeout(() => this.expire(io, id), CHALLENGE_TTL_MS),
        };
        this.byId.set(id, challenge);
        this.byFrom.set(fromId, id);

        io.to(friendSocketId).emit('friend_challenge_incoming', {
            challengeId: id,
            fromUserId: fromId,
            fromUsername: me.username,
        });
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

        const fromSocketId = socketIdFor(challenge.fromUserId);

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
        this.clearOutgoing(io, socket.data.session.userId, 'cancelled');
    }

    /** A socket dropped — tear down anything that involved that user. */
    handleDisconnect(io: AppIOServer, userId: string): void {
        // Any outgoing challenge from them.
        this.clearOutgoing(io, userId, 'offline');
        // Any incoming challenge aimed at them.
        for (const challenge of [...this.byId.values()]) {
            if (challenge.toUserId === userId) {
                this.dispose(challenge);
                const fromSocketId = socketIdFor(challenge.fromUserId);
                if (fromSocketId) {
                    io.to(fromSocketId).emit('friend_challenge_cancelled', {
                        reason: 'offline',
                    });
                }
            }
        }
    }

    // ─── internals ───────────────────────────────────────────────────────

    private expire(io: AppIOServer, challengeId: string): void {
        const challenge = this.byId.get(challengeId);
        if (!challenge) return;
        this.dispose(challenge);
        for (const userId of [challenge.fromUserId, challenge.toUserId]) {
            const sid = socketIdFor(userId);
            if (sid) {
                io.to(sid).emit('friend_challenge_cancelled', {
                    reason: 'expired',
                });
            }
        }
    }

    private clearOutgoing(
        io: AppIOServer,
        fromUserId: string,
        reason: 'cancelled' | 'offline'
    ): void {
        const id = this.byFrom.get(fromUserId);
        if (!id) return;
        const challenge = this.byId.get(id);
        if (challenge) {
            this.dispose(challenge);
            const toSocketId = socketIdFor(challenge.toUserId);
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
