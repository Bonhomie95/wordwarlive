// Live challenges: friends list, leaderboard, Classic or Mystery.
//
// A invites B. If B is online they get the in-app prompt right away; either
// way they get a push, and an invite that's still open is delivered again
// when B's app connects, so B can open the app from the notification and
// answer. On accept both players land in the normal match flow
// (match_found / match_start). Challenge matches move rank points but don't
// add leaderboard wins (unranked), so accounts can't trade forfeits into
// prizes.
//
// Mystery: A picks a word when sending; B picks a same-length word when
// accepting; each races the other's word.
//
// State is in-memory and single-node, same as presence/matchmaking. An
// invite lives CHALLENGE_TTL_MS, or until A cancels or disconnects.

import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { redis } from '../db/redis.js';
import { matchRegistry } from './matchHandler.js';
import { socketIdFor } from './presence.js';
import { findUserById } from '../services/userService.js';
import { isBlockedEither } from '../services/blocksService.js';
import { sendPushToUser } from '../services/pushService.js';
import { mysteryWordError } from '../services/mysteryService.js';
import { population } from '../services/syntheticPlayers.js';
import { pickRankAwareWord } from '../game/words.js';
import type { AppIOServer, AppSocket } from './server.js';

/** Long enough to open the app from the notification. */
const CHALLENGE_TTL_MS = 120_000;
/** Anti-spam: invites are pushes to people who may not know you. */
const SENT_PER_HOUR = 20;
const RECEIVED_PER_HOUR = 30;
/** Leaderboard filler players (see syntheticPlayers). Nobody receives their
 *  invites, so those just stay open and lapse with no answer. */
const FILLER_ID = /^synthetic:p:\d+$/;

export type ChallengeMode = 'classic' | 'mystery';

interface PendingChallenge {
    id: string;
    fromUserId: string;
    fromUsername: string;
    toUserId: string;
    mode: ChallengeMode;
    /** Mystery: the challenger's word, which the target will race. */
    word?: string;
    expiresAt: number;
    expiry: NodeJS.Timeout;
}

export type ChallengeResult =
    | { ok: true; challengeId: string; online: boolean; notified: boolean; expiresAt: number; expiresInMs: number }
    | { ok: false; error: string };

/** True while `key` has been hit at most `max` times this hour. */
async function underHourlyLimit(key: string, max: number): Promise<boolean> {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 3600);
    return n <= max;
}

class FriendChallengeHub {
    private byId = new Map<string, PendingChallenge>();
    /** fromUserId -> challengeId. One outgoing challenge per user. */
    private byFrom = new Map<string, string>();

    /** A challenges B (a friend, or anyone from the leaderboard). */
    async challenge(
        io: AppIOServer,
        socket: AppSocket,
        targetId: string,
        opts: { mode?: ChallengeMode; word?: string } = {}
    ): Promise<ChallengeResult> {
        const fromId = socket.data.session.userId;
        const mode = opts.mode ?? 'classic';
        if (!targetId || fromId === targetId) {
            return { ok: false, error: "You can't challenge yourself." };
        }
        let word: string | undefined;
        if (mode === 'mystery') {
            word = (opts.word ?? '').trim().toUpperCase();
            const invalid = mysteryWordError(word);
            if (invalid) return { ok: false, error: invalid };
        }
        if (matchRegistry.isInMatch(fromId)) {
            return { ok: false, error: "You're already in a match." };
        }
        const filler = FILLER_ID.test(targetId);
        if (!filler && (await isBlockedEither(fromId, targetId))) {
            return { ok: false, error: 'You cannot challenge this player.' };
        }
        if (!filler && matchRegistry.isInMatch(targetId)) {
            return { ok: false, error: "They're in a match right now. Try again in a few minutes." };
        }
        const [me, target] = await Promise.all([findUserById(fromId), filler ? null : findUserById(targetId)]);
        const fillerName = filler ? population().find((p) => p.userId === targetId)?.username : undefined;
        // (Banned players are off the boards and can't connect.)
        if (!me || (filler ? !fillerName : !target)) {
            return { ok: false, error: 'Player not found.' };
        }
        if (!(await underHourlyLimit(`rl:chal:from:${fromId}`, SENT_PER_HOUR))) {
            return { ok: false, error: "You've sent a lot of challenges. Try again later." };
        }
        if (!filler && !(await underHourlyLimit(`rl:chal:to:${targetId}`, RECEIVED_PER_HOUR))) {
            return { ok: false, error: 'They have a lot of challenges right now. Try again later.' };
        }

        const targetSocketId = filler ? null : await socketIdFor(targetId);
        // The match runtime is node-local: both players must be on this node.
        if (targetSocketId && !io.sockets.sockets.has(targetSocketId)) {
            return {
                ok: false,
                error: "You and this player are on different game servers right now. Try a private match code instead.",
            };
        }

        // Replace any earlier outgoing challenge from this user.
        await this.clearOutgoing(io, fromId, 'cancelled');
        const id = randomUUID();
        const expiresAt = Date.now() + CHALLENGE_TTL_MS;
        const challenge: PendingChallenge = {
            id,
            fromUserId: fromId,
            fromUsername: me.username,
            toUserId: targetId,
            mode,
            word,
            expiresAt,
            expiry: setTimeout(() => {
                this.expire(io, id).catch((err) => logger.error({ err }, 'challenge expire failed'));
            }, CHALLENGE_TTL_MS),
        };
        this.byId.set(id, challenge);
        this.byFrom.set(fromId, id);

        if (filler) {
            logger.info({ fromId, targetId, id, mode }, 'challenge to a leaderboard filler (no one to receive it)');
            return { ok: true, challengeId: id, online: false, notified: false, expiresAt, expiresInMs: CHALLENGE_TTL_MS };
        }
        if (targetSocketId) this.emitIncoming(io, targetSocketId, challenge);
        // Push too: reaches them when the app is closed or in the background.
        const delivered = await sendPushToUser(targetId, {
            title: 'WordWar',
            body:
                mode === 'mystery'
                    ? `${me.username} challenged you to a Mystery duel!`
                    : `${me.username} challenged you to a match!`,
            data: { type: 'friend_challenge', challengeId: id, fromUserId: fromId, fromUsername: me.username, mode },
        }).catch(() => 0);
        logger.info({ fromId, targetId, id, mode, online: !!targetSocketId, delivered }, 'challenge sent');
        return { ok: true, challengeId: id, online: !!targetSocketId, notified: delivered > 0, expiresAt, expiresInMs: Math.max(0, expiresAt - Date.now()) };
    }

    /** B accepts or declines. On accept we kick off a real match. */
    async respond(
        io: AppIOServer,
        socket: AppSocket,
        challengeId: string,
        accept: boolean,
        word?: string
    ): Promise<{ ok: boolean; error?: string }> {
        const challenge = this.byId.get(challengeId);
        if (!challenge) return { ok: false, error: 'Challenge expired.' };
        if (challenge.toUserId !== socket.data.session.userId) {
            return { ok: false, error: 'Not your challenge.' };
        }

        if (!accept) {
            this.dispose(challenge);
            const fromSocketId = await socketIdFor(challenge.fromUserId);
            if (fromSocketId) {
                io.to(fromSocketId).emit('friend_challenge_declined', { byUserId: challenge.toUserId });
            }
            return { ok: true };
        }

        // Mystery: check the reply word first, so a typo doesn't lose the invite.
        let replyWord: string | undefined;
        if (challenge.mode === 'mystery') {
            if (!word) return { ok: false, error: 'Update WordWar to play Mystery duels.' };
            replyWord = word.trim().toUpperCase();
            const invalid = mysteryWordError(replyWord);
            if (invalid) return { ok: false, error: invalid };
            if (replyWord.length !== challenge.word!.length) {
                return { ok: false, error: `Pick a ${challenge.word!.length}-letter word.` };
            }
        }
        this.dispose(challenge);

        const fromSocketId = await socketIdFor(challenge.fromUserId);
        if (!fromSocketId) {
            return { ok: false, error: 'The challenger went offline.' };
        }
        // Both sockets must be on THIS node for the match runtime to work
        // (see startMatch's co-location guard). The responder (socket) is
        // local by definition; verify the challenger is too.
        if (!io.sockets.sockets.has(fromSocketId)) {
            io.to(fromSocketId).emit('friend_challenge_cancelled', { reason: 'busy' });
            return {
                ok: false,
                error: "You and the challenger are on different game servers right now. Try a private match code instead.",
            };
        }
        if (matchRegistry.isInMatch(challenge.fromUserId) || matchRegistry.isInMatch(challenge.toUserId)) {
            io.to(fromSocketId).emit('friend_challenge_cancelled', { reason: 'busy' });
            return { ok: false, error: 'A player is already in a match.' };
        }

        const [host, joiner] = await Promise.all([
            findUserById(challenge.fromUserId),
            findUserById(challenge.toUserId),
        ]);
        if (!host || !joiner) return { ok: false, error: 'User not found.' };

        const players = {
            p1SocketId: fromSocketId,
            p2SocketId: socket.id,
            p1UserId: host.id,
            p2UserId: joiner.id,
            p1IsBot: false,
            p2IsBot: false,
            unranked: true,
        };
        if (challenge.mode === 'mystery') {
            // Each races the other's word: the challenger guesses the reply.
            await matchRegistry.startMatch(io, { ...players, p1Word: replyWord!, p2Word: challenge.word!, mode: 'mystery' });
        } else {
            const shared = pickRankAwareWord(Math.max(host.rank_points, joiner.rank_points));
            await matchRegistry.startMatch(io, { ...players, explicitWord: shared, mode: 'classic' });
        }
        logger.info({ from: host.id, to: joiner.id, id: challengeId, mode: challenge.mode }, 'challenge accepted -> match started');
        return { ok: true };
    }

    /** A cancels their own outgoing challenge before B responds. */
    cancel(io: AppIOServer, socket: AppSocket): void {
        this.clearOutgoing(io, socket.data.session.userId, 'cancelled').catch((err) =>
            logger.error({ err }, 'clearOutgoing (cancel) failed')
        );
    }

    /** B's app connected: show any invite still waiting for them (they may
     *  have opened the app from the notification). */
    deliverPending(io: AppIOServer, socket: AppSocket): void {
        const userId = socket.data.session.userId;
        for (const challenge of this.byId.values()) {
            if (challenge.toUserId === userId) this.emitIncoming(io, socket.id, challenge);
        }
    }

    /** A socket dropped. Their own invite is withdrawn (they can't play it);
     *  invites aimed at them stay open until they expire. */
    async handleDisconnect(io: AppIOServer, userId: string): Promise<void> {
        await this.clearOutgoing(io, userId, 'offline');
    }

    // ─── internals ───────────────────────────────────────────────────────

    private emitIncoming(io: AppIOServer, socketId: string, c: PendingChallenge): void {
        if (c.mode === 'mystery') {
            // A separate event: older apps don't know Mystery invites and
            // would otherwise accept without a word.
            io.to(socketId).emit('mystery_challenge_incoming', {
                challengeId: c.id,
                fromUserId: c.fromUserId,
                fromUsername: c.fromUsername,
                wordLength: c.word!.length,
                expiresAt: c.expiresAt,
                // Time left, so phones count down on their own clock.
                expiresInMs: Math.max(0, c.expiresAt - Date.now()),
            });
        } else {
            io.to(socketId).emit('friend_challenge_incoming', {
                challengeId: c.id,
                fromUserId: c.fromUserId,
                fromUsername: c.fromUsername,
                mode: 'classic',
                expiresAt: c.expiresAt,
                expiresInMs: Math.max(0, c.expiresAt - Date.now()),
            });
        }
    }

    private async expire(io: AppIOServer, challengeId: string): Promise<void> {
        const challenge = this.byId.get(challengeId);
        if (!challenge) return;
        this.dispose(challenge);
        for (const userId of [challenge.fromUserId, challenge.toUserId]) {
            if (FILLER_ID.test(userId)) continue;
            const sid = await socketIdFor(userId);
            if (sid) io.to(sid).emit('friend_challenge_cancelled', { reason: 'expired' });
        }
    }

    private async clearOutgoing(io: AppIOServer, fromUserId: string, reason: 'cancelled' | 'offline'): Promise<void> {
        const id = this.byFrom.get(fromUserId);
        if (!id) return;
        const challenge = this.byId.get(id);
        if (challenge) {
            this.dispose(challenge);
            if (!FILLER_ID.test(challenge.toUserId)) {
                const toSocketId = await socketIdFor(challenge.toUserId);
                if (toSocketId) io.to(toSocketId).emit('friend_challenge_cancelled', { reason });
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
