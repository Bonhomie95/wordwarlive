// Mystery-mode matchmaking.
//
// Flow:
//   1. Player POSTs /api/mystery/submit to drop a word in the pool
//   2. Player emits `mystery_queue` on the socket → enters this hub
//   3. Every 1s we attempt to pair them with another player who submitted
//      a same-length word AND push a status update so the UI can show
//      a "Searching… 12s" counter
//   4. If no human match within 15-20s (randomized per user, same range as
//      classic matchmaking), we spawn a bot opponent that plays against
//      the player's submitted word.

import { logger } from '../utils/logger.js';
import {
    getMyPendingSubmission,
    tryMatch,
    withdrawSubmission,
} from '../services/mysteryService.js';
import { getRecentResultsSummary } from '../services/matchService.js';
import { findUserById } from '../services/userService.js';
import { createBotUser, adaptiveDifficulty } from '../ai/bot.js';
import { pickRandomWord } from '../game/words.js';
import { matchRegistry } from './matchHandler.js';
import type { AppIOServer, AppSocket } from './server.js';

interface QueueEntry {
    userId: string;
    socketId: string;
    enqueuedAt: number;
    /** Randomized 15000–20000ms. After this much wait, drop in a bot. */
    botAfterMs: number;
}

// Same range as classic matchmaking — consistent UX.
const BOT_AFTER_MS_MIN = 15_000;
const BOT_AFTER_MS_MAX = 20_000;

class MysteryHub {
    private queue = new Map<string, QueueEntry>();
    private tickTimer: NodeJS.Timeout | null = null;
    private lastIo: AppIOServer | null = null;
    /** Tracks users we've already started a bot spawn for, so the tick
     *  doesn't double-fire while the bot match is being created. */
    private botSpawning = new Set<string>();

    enqueue(socket: AppSocket): void {
        const userId = socket.data.session.userId;
        const botAfterMs =
            BOT_AFTER_MS_MIN +
            Math.floor(Math.random() * (BOT_AFTER_MS_MAX - BOT_AFTER_MS_MIN));
        this.queue.set(userId, {
            userId,
            socketId: socket.id,
            enqueuedAt: Date.now(),
            botAfterMs,
        });
        this.startTickerIfNeeded();
    }

    leave(userId: string): void {
        this.queue.delete(userId);
        this.botSpawning.delete(userId);
        this.stopTickerIfIdle();
    }

    setIo(io: AppIOServer): void {
        this.lastIo = io;
    }

    private startTickerIfNeeded(): void {
        if (this.tickTimer) return;
        // 1Hz tick. Cheap; smooth countdown on the client.
        this.tickTimer = setInterval(
            () => this.tick(this.lastIo!).catch(() => {}),
            1000
        );
    }

    private stopTickerIfIdle(): void {
        if (this.queue.size === 0 && this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
    }

    async tick(io: AppIOServer): Promise<void> {
        if (!io) return;
        const now = Date.now();
        const snapshot = [...this.queue.values()];

        for (const entry of snapshot) {
            if (!this.queue.has(entry.userId)) continue;
            const waitedMs = now - entry.enqueuedAt;

            // Push status so the UI can show "Searching… 12s / 18s"
            io.to(entry.socketId).emit('mystery_queue_status', {
                state:
                    waitedMs >= entry.botAfterMs
                        ? 'matching_with_bot'
                        : 'searching',
                waitedMs,
                botAfterMs: entry.botAfterMs,
            });

            // 1. Try human match
            const result = await tryMatch(entry.userId);
            if (result.matched) {
                const oppEntry = this.queue.get(result.opponentUserId);
                if (!oppEntry) {
                    // Submission was consumed but their socket isn't here.
                    // Rare; just log and continue. Player will hit bot
                    // fallback eventually.
                    logger.warn(
                        {
                            userId: entry.userId,
                            opponentUserId: result.opponentUserId,
                        },
                        'mystery match consumed but opponent not in live queue'
                    );
                    continue;
                }

                this.queue.delete(entry.userId);
                this.queue.delete(oppEntry.userId);

                const [u1, u2] = await Promise.all([
                    findUserById(entry.userId),
                    findUserById(oppEntry.userId),
                ]);
                if (!u1 || !u2) continue;

                logger.info(
                    { p1: entry.userId, p2: oppEntry.userId, word: result.word },
                    'starting mystery match (human vs human)'
                );

                await matchRegistry.startMatch(io, {
                    p1SocketId: entry.socketId,
                    p2SocketId: oppEntry.socketId,
                    p1UserId: entry.userId,
                    p2UserId: oppEntry.userId,
                    p1IsBot: false,
                    p2IsBot: false,
                    explicitWord: result.word,
                    mode: 'mystery',
                });
                continue;
            }

            // 2. Bot fallback once we cross the threshold
            if (
                waitedMs >= entry.botAfterMs &&
                !this.botSpawning.has(entry.userId)
            ) {
                this.botSpawning.add(entry.userId);
                this.spawnBotMatchFor(io, entry).catch((err) => {
                    logger.error({ err }, 'mystery bot spawn failed');
                    this.botSpawning.delete(entry.userId);
                });
            }
        }

        this.stopTickerIfIdle();
    }

    private async spawnBotMatchFor(
        io: AppIOServer,
        entry: QueueEntry
    ): Promise<void> {
        try {
            const sub = await getMyPendingSubmission(entry.userId);
            if (!sub) {
                // Player withdrew between enqueue and bot fire.
                this.queue.delete(entry.userId);
                return;
            }

            const human = await findUserById(entry.userId);
            if (!human) return;

            // Pick a DIFFERENT random word of the same length. The player
            // is supposed to be solving a mystery — solving their OWN
            // submission would be trivial. We retry a few times to avoid
            // landing on the human's exact word, since pickRandomWord can
            // randomly return anything in the bank.
            let word = pickRandomWord(sub.wordLength);
            for (let i = 0; i < 5 && word === sub.word; i++) {
                word = pickRandomWord(sub.wordLength);
            }

            // Burn the submission so the player gets a fresh slate when
            // they come back to mystery after the match. Otherwise the
            // old word lingers as "pending" and FIND OPPONENT just
            // re-queues against the same dead submission.
            await withdrawSubmission(entry.userId);

            const bot = await createBotUser(human.rank_points);
            const recentSummary = await getRecentResultsSummary(human.id);
            const difficulty = adaptiveDifficulty(
                human.rank_points,
                recentSummary
            );

            logger.info(
                {
                    userId: human.id,
                    botId: bot.id,
                    botName: bot.username,
                    submittedWord: sub.word,
                    matchWord: word,
                    difficulty,
                },
                'starting mystery match (vs bot)'
            );

            this.queue.delete(entry.userId);

            await matchRegistry.startMatch(io, {
                p1SocketId: entry.socketId,
                p2SocketId: null,
                p1UserId: human.id,
                p2UserId: bot.id,
                p1IsBot: false,
                p2IsBot: true,
                botDifficulty: difficulty,
                explicitWord: word,
                mode: 'mystery',
            });
        } finally {
            this.botSpawning.delete(entry.userId);
        }
    }
}

export const mysteryHub = new MysteryHub();
