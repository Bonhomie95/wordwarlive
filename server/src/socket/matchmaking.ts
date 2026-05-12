// Matchmaking. Stores queued players in Redis (sorted set keyed by rank
// points) so multiple server instances could share the queue. Even running
// single-process, Redis gives us trivial atomic pop semantics.
//
// Flow:
//   1. enqueue(userId): add to queue, find an opponent within ±RANGE_START
//   2. periodic tick: expand match radius after EXPANDED_AFTER seconds
//   3. periodic tick: spawn a bot opponent after BOT_AFTER seconds
//
// We DO NOT poll Redis on a hot loop. Each enqueue triggers an immediate
// match check, and every queued player gets a per-second tick from a single
// timer for radius expansion / bot spawn.

import { redis } from '../db/redis.js';
import { env } from '../config/env.js';
import { findUserById } from '../services/userService.js';
import { createBotUser, difficultyForRank, adaptiveDifficulty } from '../ai/bot.js';
import { getRecentResultsSummary } from '../services/matchService.js';
import { logger } from '../utils/logger.js';
import { matchRegistry } from './matchHandler.js';
import type { AppIOServer, AppSocket } from './server.js';

const QUEUE_KEY = 'mm:queue';
const META_KEY = (userId: string) => `mm:meta:${userId}`;

/** Lower / upper bound for the randomized "spawn a bot" timeout, ms. Each
 *  enqueued user gets a value picked uniformly from this range so the bot
 *  appearance feels less mechanical. */
const BOT_AFTER_MS_MIN = 15_000;
const BOT_AFTER_MS_MAX = 20_000;

interface QueueMeta {
    userId: string;
    socketId: string;
    rankPoints: number;
    enqueuedAt: number; // ms epoch
    /** Randomized threshold past which we'll spawn a bot for this user.
     *  Picked at enqueue time so the same player gets a stable threshold
     *  for the duration of their queue session. */
    botAfterMs: number;
}

class MatchmakingHub {
    private tickTimer: NodeJS.Timeout | null = null;
    /** Userids we've started a bot match for, so we don't double-spawn. */
    private botSpawning = new Set<string>();

    /** Add a user to the queue and look for a match. */
    async enqueue(io: AppIOServer, socket: AppSocket): Promise<void> {
        const session = socket.data.session;
        const user = await findUserById(session.userId);
        if (!user) throw new Error('User not found');

        const botAfterMs =
            BOT_AFTER_MS_MIN +
            Math.floor(Math.random() * (BOT_AFTER_MS_MAX - BOT_AFTER_MS_MIN));

        const meta: QueueMeta = {
            userId: user.id,
            socketId: socket.id,
            rankPoints: user.rank_points,
            enqueuedAt: Date.now(),
            botAfterMs,
        };
        // ZADD by rank for cheap range queries.
        await redis.zadd(QUEUE_KEY, user.rank_points, user.id);
        await redis.set(META_KEY(user.id), JSON.stringify(meta), 'EX', 600);
        logger.debug({ userId: user.id, rank: user.rank_points }, 'Enqueued');

        socket.emit('queue_status', { state: 'searching', waitedMs: 0 });
        this.ensureTimer(io);

        await this.tryMatchNow(io, user.id, user.rank_points, env.MATCHMAKING_RANGE_START);
    }

    leave(userId: string): void {
        redis.zrem(QUEUE_KEY, userId).catch(() => {});
        redis.del(META_KEY(userId)).catch(() => {});
        this.botSpawning.delete(userId);
    }

    /** Look for an opponent within `radius` rank points. */
    private async tryMatchNow(
        io: AppIOServer,
        userId: string,
        rankPoints: number,
        radius: number
    ): Promise<void> {
        const lo = rankPoints - radius;
        const hi = rankPoints + radius;
        // ZRANGEBYSCORE to find candidates; exclude self.
        const ids = (await redis.zrangebyscore(QUEUE_KEY, lo, hi)).filter(
            (id: string) => id !== userId
        );
        if (ids.length === 0) return;

        // Pick the closest by rank.
        let bestId: string | null = null;
        let bestDelta = Number.POSITIVE_INFINITY;
        for (const id of ids) {
            const score = await redis.zscore(QUEUE_KEY, id);
            if (score === null) continue;
            const d = Math.abs(Number(score) - rankPoints);
            if (d < bestDelta) {
                bestDelta = d;
                bestId = id;
            }
        }
        if (!bestId) return;

        // Try to atomically remove both — if either is already gone, abort.
        const removed = await redis
            .multi()
            .zrem(QUEUE_KEY, userId)
            .zrem(QUEUE_KEY, bestId)
            .exec();
        if (!removed) return;
        const [r1, r2] = removed;
        if (r1?.[1] !== 1 || r2?.[1] !== 1) {
            // Someone else grabbed the opponent first. Best effort: re-add
            // ourselves if we lost the race, since we still want to play.
            if (r1?.[1] !== 1) return; // we're not in the queue anymore
            // r2 missing: opponent is gone, put us back
            await redis.zadd(QUEUE_KEY, rankPoints, userId);
            return;
        }

        const opponentMetaRaw = await redis.get(META_KEY(bestId));
        const myMetaRaw = await redis.get(META_KEY(userId));
        await redis.del(META_KEY(userId), META_KEY(bestId));
        if (!opponentMetaRaw || !myMetaRaw) return;
        const oppMeta: QueueMeta = JSON.parse(opponentMetaRaw);
        const myMeta: QueueMeta = JSON.parse(myMetaRaw);

        await matchRegistry.startMatch(io, {
            p1SocketId: myMeta.socketId,
            p2SocketId: oppMeta.socketId,
            p1UserId: myMeta.userId,
            p2UserId: oppMeta.userId,
            p1IsBot: false,
            p2IsBot: false,
        });
    }

    /**
     * Per-second tick: expand search radius and spawn bots for users that
     * have waited too long.
     */
    private ensureTimer(io: AppIOServer): void {
        if (this.tickTimer) return;
        this.tickTimer = setInterval(() => {
            this.tick(io).catch((err) => logger.error({ err }, 'mm tick failed'));
        }, 1000);
    }

    private async tick(io: AppIOServer): Promise<void> {
        const ids = await redis.zrange(QUEUE_KEY, 0, -1);
        if (ids.length === 0) {
            // Idle queue — clear the timer to save CPU.
            if (this.tickTimer) clearInterval(this.tickTimer);
            this.tickTimer = null;
            return;
        }

        for (const id of ids) {
            const metaRaw = await redis.get(META_KEY(id));
            if (!metaRaw) continue;
            const meta: QueueMeta = JSON.parse(metaRaw);
            const waited = Date.now() - meta.enqueuedAt;

            // Re-emit status so the client can update its wait UI.
            io.to(meta.socketId).emit('queue_status', {
                state:
                    waited >= meta.botAfterMs
                        ? 'matching_with_bot'
                        : waited >= 10_000
                        ? 'expanded_search'
                        : 'searching',
                waitedMs: waited,
            });

            // Try to match with an expanded radius.
            if (waited >= 10_000) {
                await this.tryMatchNow(
                    io,
                    meta.userId,
                    meta.rankPoints,
                    env.MATCHMAKING_RANGE_EXPANDED
                );
            }

            // Spawn a bot match if the user has waited past their (randomized)
            // threshold.
            if (
                waited >= meta.botAfterMs &&
                !this.botSpawning.has(meta.userId)
            ) {
                this.botSpawning.add(meta.userId);
                this.spawnBotMatch(io, meta).catch((err) => {
                    logger.error({ err, userId: meta.userId }, 'bot match spawn failed');
                    this.botSpawning.delete(meta.userId);
                });
            }
        }
    }

    private async spawnBotMatch(io: AppIOServer, humanMeta: QueueMeta): Promise<void> {
        // Remove the human from the queue first.
        const removed = await redis.zrem(QUEUE_KEY, humanMeta.userId);
        if (removed === 0) return; // someone else matched them already
        await redis.del(META_KEY(humanMeta.userId));

        // Create a bot user with a fresh realistic username and plausible
        // stats — generated each match so the player doesn't see the same
        // opponent twice.
        const bot = await createBotUser(humanMeta.rankPoints);

        // Adaptive difficulty: rank gives the baseline, recent results
        // shift it. Players on hot streaks get harder bots; players in a
        // slump get a chance to break out.
        const recentSummary = await getRecentResultsSummary(humanMeta.userId);
        const difficulty = adaptiveDifficulty(humanMeta.rankPoints, recentSummary);
        logger.info(
            {
                userId: humanMeta.userId,
                botId: bot.id,
                botName: bot.username,
                difficulty,
                baseDifficulty: difficultyForRank(humanMeta.rankPoints),
                recentSummary,
            },
            'Starting bot match'
        );

        await matchRegistry.startMatch(io, {
            p1SocketId: humanMeta.socketId,
            p2SocketId: null,
            p1UserId: humanMeta.userId,
            p2UserId: bot.id,
            p1IsBot: false,
            p2IsBot: true,
            botDifficulty: difficulty,
        });

        this.botSpawning.delete(humanMeta.userId);
    }
}

export const matchmakingHub = new MatchmakingHub();
