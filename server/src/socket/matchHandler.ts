// Per-match runtime state. The server owns the target word and the clock;
// clients see only their own letters and the opponent's tile colors. Guesses
// are rate-limited via Redis so a malicious client can't hammer the engine.

import { randomUUID } from 'node:crypto';
import { redis } from '../db/redis.js';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
    scoreGuess,
    validateGuess,
    decideOutcome,
    shouldEnd,
    type GuessResult,
} from '../game/engine.js';
import { isValidWord, pickRankAwareWord } from '../game/words.js';
import {
    findUserById,
    applyMatchResult,
} from '../services/userService.js';
import { computeRankDelta } from '../game/ranks.js';
import { persistMatch } from '../services/matchService.js';
import { awardMatchXp } from '../services/battlePassService.js';
import { grantCoins } from '../services/coinsService.js';
import { advanceStreakOnMatchComplete } from '../services/streakService.js';
import { redeemHint } from '../services/hintService.js';
import { recordMatchResult } from '../services/leaderboardService.js';
import { updatePeak as updateSeasonPeak } from '../services/rankSeasonService.js';
import { saveReplay } from '../services/replayService.js';
import { chooseBotGuess, thinkTimeMs, type BotDifficulty } from '../ai/bot.js';
import type { AppIOServer, AppSocket } from './server.js';
import type { GuessAck, HintAck, MatchOver, PublicUser } from '../types/index.js';

/** Coins awarded to the winner of a match. Bot games still pay out — the
 *  human earns them, the bot doesn't because we skip applyMatchResult / grants
 *  for the bot side. */
const COINS_PER_WIN = 5;

interface ActiveMatch {
    id: string;
    word: string; // server-only — never sent until match_over
    p1UserId: string;
    p2UserId: string;
    p1SocketId: string | null;
    p2SocketId: string | null;
    p1IsBot: boolean;
    p2IsBot: boolean;
    p1Guesses: GuessResult[];
    p2Guesses: GuessResult[];
    /** Per-match hint counter. Each player gets ONE hint per match total,
     *  regardless of payment kind (free/credit/coins). */
    p1HintsUsed: number;
    p2HintsUsed: number;
    /** Match mode: 'classic' (rank-aware word) or 'mystery' (player-submitted). */
    mode: 'classic' | 'mystery';
    startedAtMs: number;
    durationMs: number;
    botDifficulty?: BotDifficulty;
    /** Set when match has ended so duplicate end-calls become no-ops. */
    ended: boolean;
    timerHandle: NodeJS.Timeout | null;
    botTimerHandle: NodeJS.Timeout | null;
    /** Reconnect grace timers. When a player drops, we set this; if they
     *  reconnect before it fires we cancel; otherwise we forfeit them. */
    p1GraceTimer: NodeJS.Timeout | null;
    p2GraceTimer: NodeJS.Timeout | null;
    /** Lock state — if non-null and in the future, the player can't use
     *  powerups. Set by the opponent's Lock powerup. */
    p1LockedUntilMs: number | null;
    p2LockedUntilMs: number | null;
    /** Emoji-spam rate limit per slot — ms-epoch of last emoji. */
    p1LastEmojiMs?: number;
    p2LastEmojiMs?: number;
}

/** Grace period for reconnects — players who drop have this long to come
 *  back before they forfeit. 60 s catches typical mobile network handovers
 *  (wifi → cellular while leaving a building) and brief app-switches. */
const RECONNECT_GRACE_MS = 60_000;

interface StartArgs {
    p1SocketId: string;
    p2SocketId: string | null;
    p1UserId: string;
    p2UserId: string;
    p1IsBot: boolean;
    p2IsBot: boolean;
    botDifficulty?: BotDifficulty;
    /** Optional. If provided, this exact word is used instead of the
     *  rank-aware pick. Mystery mode passes one of the player-submitted
     *  words here. */
    explicitWord?: string;
    mode?: 'classic' | 'mystery';
}

class MatchRegistry {
    private byMatchId = new Map<string, ActiveMatch>();
    /** userId -> matchId */
    private byUserId = new Map<string, string>();

    async startMatch(io: AppIOServer, args: StartArgs): Promise<void> {
        const [p1, p2] = await Promise.all([
            findUserById(args.p1UserId),
            findUserById(args.p2UserId),
        ]);
        if (!p1 || !p2) throw new Error('Player(s) not found for match');

        const word =
            args.explicitWord ??
            pickRankAwareWord(Math.max(p1.rank_points, p2.rank_points));

        const match: ActiveMatch = {
            id: randomUUID(),
            word,
            mode: args.mode ?? 'classic',
            p1UserId: p1.id,
            p2UserId: p2.id,
            p1SocketId: args.p1SocketId,
            p2SocketId: args.p2SocketId,
            p1IsBot: args.p1IsBot,
            p2IsBot: args.p2IsBot,
            p1Guesses: [],
            p2Guesses: [],
            p1HintsUsed: 0,
            p2HintsUsed: 0,
            startedAtMs: Date.now(),
            durationMs: env.MATCH_DURATION_SECONDS * 1000,
            botDifficulty: args.botDifficulty,
            ended: false,
            timerHandle: null,
            botTimerHandle: null,
            p1GraceTimer: null,
            p2GraceTimer: null,
            p1LockedUntilMs: null,
            p2LockedUntilMs: null,
        };
        this.byMatchId.set(match.id, match);
        this.byUserId.set(p1.id, match.id);
        this.byUserId.set(p2.id, match.id);

        const p1Public: PublicUser = userToPublic(p1);
        const p2Public: PublicUser = userToPublic(p2);

        if (match.p1SocketId) {
            io.to(match.p1SocketId).emit('match_found', {
                matchId: match.id,
                wordLength: word.length,
                durationSeconds: env.MATCH_DURATION_SECONDS,
                you: p1Public,
                opponent: p2Public,
                slot: 1,
            });
            io.to(match.p1SocketId).emit('match_start', {
                matchId: match.id,
                startedAt: match.startedAtMs,
            });
        }
        if (match.p2SocketId) {
            io.to(match.p2SocketId).emit('match_found', {
                matchId: match.id,
                wordLength: word.length,
                durationSeconds: env.MATCH_DURATION_SECONDS,
                you: p2Public,
                opponent: p1Public,
                slot: 2,
            });
            io.to(match.p2SocketId).emit('match_start', {
                matchId: match.id,
                startedAt: match.startedAtMs,
            });
        }

        // Tick + auto-end timers.
        match.timerHandle = setInterval(() => this.tick(io, match), 1000);
        setTimeout(
            () => this.endMatch(io, match, { reason: 'time_up' }).catch(() => {}),
            match.durationMs
        );

        // Bot guess loop, if applicable.
        if (args.p1IsBot || args.p2IsBot) {
            this.scheduleBotGuess(io, match);
        }

        logger.info(
            {
                matchId: match.id,
                p1: p1.username,
                p2: p2.username,
                wordLength: word.length,
                botGame: args.p1IsBot || args.p2IsBot,
            },
            'Match started'
        );
    }

    /** Per-second clock tick — emit msRemaining to both sides. */
    private tick(io: AppIOServer, match: ActiveMatch): void {
        if (match.ended) return;
        const elapsed = Date.now() - match.startedAtMs;
        const remaining = Math.max(0, match.durationMs - elapsed);
        if (match.p1SocketId)
            io.to(match.p1SocketId).emit('match_tick', { msRemaining: remaining });
        if (match.p2SocketId)
            io.to(match.p2SocketId).emit('match_tick', { msRemaining: remaining });
        if (remaining === 0 && !match.ended) {
            this.endMatch(io, match, { reason: 'time_up' }).catch(() => {});
        }
    }

    async handleGuess(
        io: AppIOServer,
        socket: AppSocket,
        rawGuess: string
    ): Promise<GuessAck> {
        const userId = socket.data.session.userId;
        const matchId = this.byUserId.get(userId);
        if (!matchId) return { ok: false, error: 'Not in a match', errorCode: 'GAME_NOT_ACTIVE' };
        const match = this.byMatchId.get(matchId);
        if (!match || match.ended) return { ok: false, error: 'Game not active', errorCode: 'GAME_NOT_ACTIVE' };

        const isP1 = match.p1UserId === userId;

        // Rate limit via Redis. SET NX EX with the duration we want between
        // guesses for this user. If the key exists, it's too soon.
        const rlKey = `rl:guess:${userId}`;
        const ok = await redis.set(rlKey, '1', 'PX', env.GUESS_RATE_LIMIT_MS, 'NX');
        if (ok !== 'OK') return { ok: false, error: 'Slow down', errorCode: 'RATE_LIMITED' };

        const guess = rawGuess.trim().toUpperCase();
        const valError = validateGuess(guess, match.word.length, isValidWord);
        if (valError) return { ok: false, error: valError.message, errorCode: valError.code };

        const result = scoreGuess(guess, match.word);
        const list = isP1 ? match.p1Guesses : match.p2Guesses;
        list.push(result);
        const guessIndex = list.length - 1;

        // Broadcast — both players see the tiles, but only the guesser sees
        // the literal letters.
        const myPayload = {
            matchId: match.id,
            side: 'me' as const,
            guessIndex,
            guess: result.guess,
            tiles: result.tiles,
            solved: result.solved,
        };
        const oppPayload = {
            matchId: match.id,
            side: 'opponent' as const,
            guessIndex,
            guess: null,
            tiles: result.tiles,
            solved: result.solved,
        };
        if (isP1) {
            if (match.p1SocketId) io.to(match.p1SocketId).emit('guess_result', myPayload);
            if (match.p2SocketId) io.to(match.p2SocketId).emit('guess_result', oppPayload);
        } else {
            if (match.p2SocketId) io.to(match.p2SocketId).emit('guess_result', myPayload);
            if (match.p1SocketId) io.to(match.p1SocketId).emit('guess_result', oppPayload);
        }

        if (shouldEnd(match.p1Guesses, match.p2Guesses)) {
            await this.endMatch(io, match, { reason: 'engine_decided' });
        }
        return { ok: true };
    }

    /**
     * Power-up handling.
     *
     * - REVEAL: tell only the requesting player one position+letter that
     *   they haven't yet greened. Consumes 1 from inventory.
     * - SCRAMBLE: opposing player's tile-typing UI is visually scrambled
     *   for 1.5s (their typed letters render in random positions).
     *   Doesn't affect their actual guess submission, just confuses them.
     *   Consumes 1 from inventory.
     * - LOCK: opposing player can't use powerups for 8 seconds. Server
     *   tracks lock expiry on the match record. Consumes 1.
     *
     * Note on inventory: we decrement on use (not on award) so failed
     * uses (e.g. tried to scramble after match ended) don't consume.
     */
    async handlePowerUp(
        io: AppIOServer,
        socket: AppSocket,
        kind: 'reveal' | 'scramble' | 'lock',
        _targetGuessIndex: number | null
    ): Promise<{ ok: boolean; error?: string }> {
        const userId = socket.data.session.userId;
        const matchId = this.byUserId.get(userId);
        if (!matchId) return { ok: false, error: 'Not in a match' };
        const match = this.byMatchId.get(matchId);
        if (!match || match.ended) return { ok: false, error: 'Game not active' };

        const isP1 = match.p1UserId === userId;
        const lockedUntil = isP1 ? match.p1LockedUntilMs : match.p2LockedUntilMs;
        if (lockedUntil && Date.now() < lockedUntil) {
            return {
                ok: false,
                error: 'Your powerups are locked. Wait a moment.',
            };
        }

        // Check + decrement inventory atomically.
        const col = `powerup_${kind}` as 'powerup_reveal' | 'powerup_scramble' | 'powerup_lock';
        const rows = await query<{ remaining: number }>(
            `UPDATE users SET ${col} = ${col} - 1, updated_at = now()
             WHERE id = $1 AND ${col} > 0
             RETURNING ${col} AS remaining`,
            [userId]
        );
        if (rows.length === 0) {
            return { ok: false, error: `You have no ${kind} powerups left.` };
        }

        const opponentSocketId = isP1 ? match.p2SocketId : match.p1SocketId;

        if (kind === 'reveal') {
            // Pick one position the requester hasn't already greened.
            const history = isP1 ? match.p1Guesses : match.p2Guesses;
            const greened = new Set<number>();
            for (const g of history) {
                for (let i = 0; i < g.tiles.length; i++) {
                    if (g.tiles[i] === 'correct') greened.add(i);
                }
            }
            const candidates: { pos: number; letter: string }[] = [];
            for (let i = 0; i < match.word.length; i++) {
                if (!greened.has(i)) {
                    candidates.push({ pos: i, letter: match.word[i]! });
                }
            }
            if (candidates.length === 0) {
                return { ok: false, error: 'No positions left to reveal.' };
            }
            const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
            // Tell only the requester via a dedicated event.
            socket.emit('powerup_reveal_letter', {
                position: pick.pos,
                letter: pick.letter,
            });
            return { ok: true };
        }

        if (kind === 'scramble') {
            if (opponentSocketId) {
                io.to(opponentSocketId).emit('opponent_scramble');
            }
            return { ok: true };
        }

        if (kind === 'lock') {
            const LOCK_DURATION_MS = 8_000;
            const lockUntil = Date.now() + LOCK_DURATION_MS;
            if (isP1) match.p2LockedUntilMs = lockUntil;
            else match.p1LockedUntilMs = lockUntil;
            if (opponentSocketId) {
                io.to(opponentSocketId).emit('powerup_locked', {
                    durationMs: LOCK_DURATION_MS,
                });
            }
            return { ok: true };
        }

        return { ok: false, error: 'Unknown powerup' };
    }

    /**
     * Forward an emoji reaction to the opponent. Server-side rate limit:
     * one emoji per user per 1.5s. Outside whitelist → silently dropped.
     */
    async handleEmoji(io: AppIOServer, socket: AppSocket, emoji: string): Promise<void> {
        const userId = socket.data.session.userId;
        const matchId = this.byUserId.get(userId);
        if (!matchId) return;
        const match = this.byMatchId.get(matchId);
        if (!match || match.ended) return;

        // Whitelist of safe emojis. Anything outside this is dropped.
        const ALLOWED = new Set(['👍', '😂', '😮', '🔥', '🤔', '🤯', '🎉', '😭']);
        if (!ALLOWED.has(emoji)) return;

        // Rate limit: stash last-emoji timestamp on the match record.
        const isP1 = match.p1UserId === userId;
        const now = Date.now();
        const lastKey = isP1 ? 'p1LastEmojiMs' : 'p2LastEmojiMs';
        const last = match[lastKey] ?? 0;
        if (now - last < 1500) return;
        match[lastKey] = now;

        const opponentSocketId = isP1 ? match.p2SocketId : match.p1SocketId;
        if (opponentSocketId) {
            io.to(opponentSocketId).emit('opponent_emoji', { emoji });
        }
    }

    async handleHint(socket: AppSocket): Promise<HintAck> {
        const userId = socket.data.session.userId;
        const matchId = this.byUserId.get(userId);
        if (!matchId) {
            return {
                ok: false,
                error: 'Not in a match',
                errorCode: 'GAME_NOT_ACTIVE',
            };
        }
        const match = this.byMatchId.get(matchId);
        if (!match || match.ended) {
            return {
                ok: false,
                error: 'Game not active',
                errorCode: 'GAME_NOT_ACTIVE',
            };
        }
        const isP1 = match.p1UserId === userId;
        const history = isP1 ? match.p1Guesses : match.p2Guesses;
        const usedSoFar = isP1 ? match.p1HintsUsed : match.p2HintsUsed;

        // Hint cap is word-length-aware: short words (4-7) get 1 hint,
        // long words (8-10) get 2 since they're meaningfully harder to
        // crack and a single positional reveal is less impactful.
        const hintCap = match.word.length >= 8 ? 2 : 1;
        if (usedSoFar >= hintCap) {
            return {
                ok: false,
                error:
                    hintCap === 1
                        ? 'You already used your hint for this match.'
                        : `You've used both hints for this match.`,
                errorCode: 'PER_MATCH_LIMIT',
            };
        }

        const result = await redeemHint({
            userId,
            matchId: match.id,
            target: match.word,
            history,
        });
        if (!result.ok) {
            const message =
                result.error === 'NO_POSITIONS_LEFT'
                    ? "You've already revealed everything we could hint at."
                    : result.error === 'NOT_AFFORDABLE'
                    ? 'Not enough coins to buy a hint.'
                    : result.error === 'PER_MATCH_LIMIT'
                    ? 'You already used your hint for this match.'
                    : 'Hint unavailable.';
            return {
                ok: false,
                error: message,
                errorCode: result.error,
            };
        }

        // Successful redeem — burn the per-match slot.
        if (isP1) match.p1HintsUsed += 1;
        else match.p2HintsUsed += 1;

        return {
            ok: true,
            position: result.position,
            letter: result.letter,
            paidWith: result.paidWith,
            coinsSpent: result.coinsSpent,
            coinsRemaining: result.coinsRemaining,
            hintCreditsRemaining: result.hintCreditsRemaining,
            // No more free hints possible in THIS match (cap already burned).
            freeRemaining: false,
            lifetimeHintsUsed: result.lifetimeHintsUsed,
        };
    }

    /**
     * Player's socket disconnected mid-match. Instead of forfeiting
     * immediately we:
     *   1. Clear their socketId so we stop trying to send to a dead socket
     *   2. Start a RECONNECT_GRACE_MS countdown
     *   3. If they call match_resume before the timer fires, reattach
     *   4. If the timer fires first, end the match by forfeit
     *
     * Match clock keeps ticking, opponent keeps playing (bots especially).
     * If the opponent solves while the player is away, the match ends
     * normally and the disconnected player will see the loss screen on
     * reconnect (the gameStore's match_over still fires per slot).
     *
     * If a player rejoins via a fresh socket, the new socket id replaces
     * the old one in the match record.
     */
    async handleDisconnect(io: AppIOServer, socket: AppSocket): Promise<void> {
        const userId = socket.data.session.userId;
        const matchId = this.byUserId.get(userId);
        if (!matchId) return;
        const match = this.byMatchId.get(matchId);
        if (!match || match.ended) return;

        const isP1 = match.p1UserId === userId;
        // Only respond if this is the CURRENT socket — a stale disconnect
        // from a socket the player has already replaced shouldn't kick in.
        const currentSocketId = isP1 ? match.p1SocketId : match.p2SocketId;
        if (currentSocketId !== null && currentSocketId !== socket.id) return;

        if (isP1) match.p1SocketId = null;
        else match.p2SocketId = null;

        logger.info(
            { matchId: match.id, userId, slot: isP1 ? 1 : 2 },
            'Player dropped — starting reconnect grace'
        );

        // Schedule forfeit unless they come back. Stash the timer on the
        // match so handleResume can cancel.
        const timer = setTimeout(() => {
            if (match.ended) return;
            // Still no reconnect — forfeit.
            const stillDropped = isP1 ? match.p1SocketId === null : match.p2SocketId === null;
            if (!stillDropped) return;
            logger.info(
                { matchId: match.id, userId, slot: isP1 ? 1 : 2 },
                'Reconnect grace expired — forfeit'
            );
            this.endMatch(io, match, {
                reason: 'disconnect',
                forfeitedSlot: isP1 ? 1 : 2,
            }).catch((err) => logger.error({ err }, 'forfeit failed'));
        }, RECONNECT_GRACE_MS);

        if (isP1) match.p1GraceTimer = timer;
        else match.p2GraceTimer = timer;
    }

    /**
     * Player came back. Reattach their new socket to the match, cancel the
     * grace timer, and replay current state so the UI snaps back to where
     * the match actually is. Called on the new socket via match_resume.
     *
     * If the player's match has already ended (e.g. opponent solved while
     * they were dropped), we emit `match_over` on the new socket so the
     * loss screen renders correctly.
     */
    /**
     * Explicit forfeit by the player. Different from disconnect:
     *   - No grace period — match ends immediately
     *   - Quitter is recorded as the loser (same outcome as a 60s
     *     reconnect-grace timeout would have produced)
     *
     * Used when the user taps the "Quit Match" button. The opponent
     * sees match_over right away rather than playing alone for 60s.
     */
    async handleQuit(
        io: AppIOServer,
        socket: AppSocket
    ): Promise<{ ok: boolean; reason?: string }> {
        const userId = socket.data.session.userId;
        const matchId = this.byUserId.get(userId);
        if (!matchId) return { ok: false, reason: 'No active match' };
        const match = this.byMatchId.get(matchId);
        if (!match || match.ended) return { ok: false, reason: 'Match not active' };

        const slot: 1 | 2 = match.p1UserId === userId ? 1 : 2;
        logger.info(
            { matchId: match.id, userId, slot },
            'Player quit — forfeiting immediately'
        );
        await this.endMatch(io, match, { reason: 'disconnect', forfeitedSlot: slot });
        return { ok: true };
    }

    async handleResume(
        io: AppIOServer,
        socket: AppSocket
    ): Promise<{ ok: boolean; reason?: string }> {
        const userId = socket.data.session.userId;
        const matchId = this.byUserId.get(userId);
        if (!matchId) return { ok: false, reason: 'No active match' };
        const match = this.byMatchId.get(matchId);
        if (!match) return { ok: false, reason: 'Match not found' };
        if (match.ended) {
            // Match ended while player was away. The match_over emit
            // already happened with their old socket. We can't replay it
            // — the registry deletes ended matches. So tell the client
            // to navigate to home and refresh /me, where their stats
            // reflect the result.
            return { ok: false, reason: 'Match already ended' };
        }

        const isP1 = match.p1UserId === userId;
        if (isP1) {
            if (match.p1GraceTimer) clearTimeout(match.p1GraceTimer);
            match.p1GraceTimer = null;
            match.p1SocketId = socket.id;
        } else {
            if (match.p2GraceTimer) clearTimeout(match.p2GraceTimer);
            match.p2GraceTimer = null;
            match.p2SocketId = socket.id;
        }

        // Replay match state to the new socket — match_found re-establishes
        // opponent info, then match_start so the client phase flips to
        // 'playing', then we send each historical guess so the grids fill.
        const elapsed = Date.now() - match.startedAtMs;
        const remaining = Math.max(0, match.durationMs - elapsed);
        const opponent: PublicUser = isP1
            ? await this.publicUserFor(match.p2UserId)
            : await this.publicUserFor(match.p1UserId);
        const me: PublicUser = isP1
            ? await this.publicUserFor(match.p1UserId)
            : await this.publicUserFor(match.p2UserId);

        socket.emit('match_found', {
            matchId: match.id,
            wordLength: match.word.length,
            durationSeconds: Math.ceil(match.durationMs / 1000),
            slot: isP1 ? 1 : 2,
            you: me,
            opponent,
        });
        socket.emit('match_start', {
            matchId: match.id,
            startedAt: match.startedAtMs,
        });
        // Re-send tile colors so the grids fill in.
        const myHistory = isP1 ? match.p1Guesses : match.p2Guesses;
        const oppHistory = isP1 ? match.p2Guesses : match.p1Guesses;
        for (let i = 0; i < myHistory.length; i++) {
            socket.emit('guess_result', {
                matchId: match.id,
                side: 'me',
                guessIndex: i,
                guess: myHistory[i]!.guess,
                tiles: myHistory[i]!.tiles,
                solved: myHistory[i]!.tiles.every((t) => t === 'correct'),
            });
        }
        for (let i = 0; i < oppHistory.length; i++) {
            socket.emit('guess_result', {
                matchId: match.id,
                side: 'opponent',
                guessIndex: i,
                guess: null,
                tiles: oppHistory[i]!.tiles,
                solved: oppHistory[i]!.tiles.every((t) => t === 'correct'),
            });
        }
        socket.emit('match_tick', { msRemaining: remaining });
        // Reference io to satisfy the unused-param lint.
        void io;
        return { ok: true };
    }

    /** Hydrate a public-user view for the resume payload. */
    private async publicUserFor(userId: string): Promise<PublicUser> {
        const u = await findUserById(userId);
        if (!u) throw new Error(`User ${userId} not found`);
        return {
            id: u.id,
            username: u.username,
            provider: u.auth_provider,
            rankPoints: u.rank_points,
            rankTier: u.rank_tier as PublicUser['rankTier'],
            wins: u.wins,
            losses: u.losses,
            equipped: {
                boardTheme: u.equipped_board_theme,
                victoryAnim: u.equipped_victory_anim,
                avatar: u.equipped_avatar,
                nameplate: u.equipped_nameplate,
                profileBorder: u.equipped_profile_border,
            },
        };
    }

    private scheduleBotGuess(io: AppIOServer, match: ActiveMatch): void {
        if (match.ended) return;
        const delay = thinkTimeMs(match.botDifficulty ?? 'medium');
        match.botTimerHandle = setTimeout(() => this.botStep(io, match), delay);
    }

    private async botStep(io: AppIOServer, match: ActiveMatch): Promise<void> {
        if (match.ended) return;
        try {
            const isP1Bot = match.p1IsBot;
            const history = isP1Bot ? match.p1Guesses : match.p2Guesses;
            // Build candidate pool of all words of the right length.
            const { query } = await import('../db/pool.js');
            const rows = await query<{ word: string }>(
                'SELECT word FROM word_bank WHERE length = $1',
                [match.word.length]
            );
            const candidates = rows.map((r) => r.word);

            const guess = await chooseBotGuess({
                wordLength: match.word.length,
                history,
                difficulty: match.botDifficulty ?? 'medium',
                candidates,
            });

            const result = scoreGuess(guess, match.word);
            history.push(result);
            const guessIndex = history.length - 1;

            // Bot's letters are revealed to the human (the human's "opponent"
            // grid shows what the bot guessed). Per the brief, opponent guesses
            // show only color tiles, not letters — keep that consistency.
            const humanSocketId = isP1Bot ? match.p2SocketId : match.p1SocketId;
            if (humanSocketId) {
                io.to(humanSocketId).emit('guess_result', {
                    matchId: match.id,
                    side: 'opponent',
                    guessIndex,
                    guess: null,
                    tiles: result.tiles,
                    solved: result.solved,
                });
            }

            if (shouldEnd(match.p1Guesses, match.p2Guesses)) {
                await this.endMatch(io, match, { reason: 'engine_decided' });
                return;
            }
            this.scheduleBotGuess(io, match);
        } catch (err) {
            logger.error({ err }, 'Bot step failed');
            this.scheduleBotGuess(io, match);
        }
    }

    private async endMatch(
        io: AppIOServer,
        match: ActiveMatch,
        opts: {
            reason: 'time_up' | 'engine_decided' | 'disconnect';
            forfeitedSlot?: 1 | 2;
        }
    ): Promise<void> {
        if (match.ended) return;
        match.ended = true;
        if (match.timerHandle) clearInterval(match.timerHandle);
        if (match.botTimerHandle) clearTimeout(match.botTimerHandle);
        if (match.p1GraceTimer) clearTimeout(match.p1GraceTimer);
        if (match.p2GraceTimer) clearTimeout(match.p2GraceTimer);

        const outcome = decideOutcome({
            p1Guesses: match.p1Guesses,
            p2Guesses: match.p2Guesses,
            forfeitedPlayer: opts.forfeitedSlot,
        });

        let winner: 'p1' | 'p2' | 'tie';
        if (outcome === 'p1_solved' || outcome === 'p1_more_correct') winner = 'p1';
        else if (outcome === 'p2_solved' || outcome === 'p2_more_correct') winner = 'p2';
        else winner = 'tie';

        const [p1, p2] = await Promise.all([
            findUserById(match.p1UserId),
            findUserById(match.p2UserId),
        ]);
        if (!p1 || !p2) {
            logger.error({ matchId: match.id }, 'Could not load players at end of match');
            this.byMatchId.delete(match.id);
            this.byUserId.delete(match.p1UserId);
            this.byUserId.delete(match.p2UserId);
            return;
        }

        const { p1Delta, p2Delta } = computeRankDelta({
            p1Points: p1.rank_points,
            p2Points: p2.rank_points,
            winner,
            forfeit: opts.reason === 'disconnect',
            p1IsBot: match.p1IsBot,
            p2IsBot: match.p2IsBot,
        });

        // Apply rank/win/loss/streak updates. Bots' updates are harmless but
        // we skip them to keep bot rows from drifting unnecessarily.
        const [updatedP1, updatedP2] = await Promise.all([
            match.p1IsBot
                ? Promise.resolve(p1)
                : applyMatchResult({
                      userId: p1.id,
                      isWinner: winner === 'p1',
                      rankDelta: p1Delta,
                  }),
            match.p2IsBot
                ? Promise.resolve(p2)
                : applyMatchResult({
                      userId: p2.id,
                      isWinner: winner === 'p2',
                      rankDelta: p2Delta,
                  }),
        ]);

        // Persist the match + replay. Wrapped because any DB hiccup here
        // shouldn't prevent the player from seeing their victory screen —
        // worst case they lose the replay/history, but match_over still
        // fires below and rank/coins are already applied.
        const winnerId = winner === 'p1' ? p1.id : winner === 'p2' ? p2.id : null;
        const durationSec = Math.round((Date.now() - match.startedAtMs) / 1000);
        try {
            await persistMatch({
                matchId: match.id,
                player1Id: p1.id,
                player2Id: p2.id,
                word: match.word,
                durationSeconds: durationSec,
                outcome,
                winnerId,
                p1RankDelta: p1Delta,
                p2RankDelta: p2Delta,
                p1IsBot: match.p1IsBot,
                p2IsBot: match.p2IsBot,
                p1Guesses: match.p1Guesses,
                p2Guesses: match.p2Guesses,
                startedAtMs: match.startedAtMs,
            });

            // Replay only when at least one human participated.
            if (!match.p1IsBot || !match.p2IsBot) {
                await saveReplay({
                    matchId: match.id,
                    mode: match.mode,
                    word: match.word,
                    p1UserId: p1.id,
                    p2UserId: p2.id,
                    p1Username: p1.username,
                    p2Username: p2.username,
                    p1Guesses: match.p1Guesses,
                    p2Guesses: match.p2Guesses,
                    winner: winner === 'p1' ? 'p1' : winner === 'p2' ? 'p2' : 'tie',
                    outcome,
                    durationMs: Date.now() - match.startedAtMs,
                    startedAtMs: match.startedAtMs,
                });
            }
        } catch (persistErr) {
            logger.error(
                { err: persistErr, matchId: match.id },
                'Failed to persist match / replay — continuing anyway so client gets match_over'
            );
        }

        // Battle pass XP.
        const p1XpResult = match.p1IsBot
            ? { xpAwarded: 0, newXp: 0, newTier: 0 }
            : await awardMatchXp({
                  userId: p1.id,
                  result: winner === 'p1' ? 'win' : winner === 'tie' ? 'tie' : 'loss',
              });
        const p2XpResult = match.p2IsBot
            ? { xpAwarded: 0, newXp: 0, newTier: 0 }
            : await awardMatchXp({
                  userId: p2.id,
                  result: winner === 'p2' ? 'win' : winner === 'tie' ? 'tie' : 'loss',
              });

        // Coins for the winner. Bots don't earn anything.
        let p1CoinsAwarded = 0;
        let p2CoinsAwarded = 0;
        let p1CoinsTotal = updatedP1.coins;
        let p2CoinsTotal = updatedP2.coins;
        if (winner === 'p1' && !match.p1IsBot) {
            p1CoinsAwarded = COINS_PER_WIN;
            p1CoinsTotal = await grantCoins({
                userId: p1.id,
                amount: COINS_PER_WIN,
                source: 'match_win',
                metadata: { matchId: match.id },
            });
        }
        if (winner === 'p2' && !match.p2IsBot) {
            p2CoinsAwarded = COINS_PER_WIN;
            p2CoinsTotal = await grantCoins({
                userId: p2.id,
                amount: COINS_PER_WIN,
                source: 'match_win',
                metadata: { matchId: match.id },
            });
        }

        // Daily play-streak. Both players get credit for completing a match
        // (regardless of result), but bots don't.
        const p1Streak = match.p1IsBot
            ? null
            : await advanceStreakOnMatchComplete(p1.id);
        const p2Streak = match.p2IsBot
            ? null
            : await advanceStreakOnMatchComplete(p2.id);

        // Leaderboards (skip bots — we don't want them on the rankings).
        if (!match.p1IsBot) {
            await recordMatchResult({
                userId: p1.id,
                isWin: winner === 'p1',
                rankPoints: updatedP1.rank_points,
                mode: match.mode,
            });
            await updateSeasonPeak(p1.id, updatedP1.rank_points);
        }
        if (!match.p2IsBot) {
            await recordMatchResult({
                userId: p2.id,
                isWin: winner === 'p2',
                rankPoints: updatedP2.rank_points,
                mode: match.mode,
            });
            await updateSeasonPeak(p2.id, updatedP2.rank_points);
        }

        const p1Result: 'win' | 'loss' | 'tie' =
            winner === 'p1' ? 'win' : winner === 'tie' ? 'tie' : 'loss';
        const p2Result: 'win' | 'loss' | 'tie' =
            winner === 'p2' ? 'win' : winner === 'tie' ? 'tie' : 'loss';

        const p1Payload: MatchOver = {
            matchId: match.id,
            result: p1Result,
            outcome,
            word: match.word,
            rankDelta: p1Delta,
            newRankPoints: updatedP1.rank_points,
            newRankTier: updatedP1.rank_tier as MatchOver['newRankTier'],
            battlePassXpAwarded: p1XpResult.xpAwarded,
            yourGuesses: match.p1Guesses.map((g) => ({ guess: g.guess, tiles: g.tiles })),
            opponentGuesses: match.p2Guesses.map((g) => ({ guess: g.guess, tiles: g.tiles })),
            coinsAwarded: p1CoinsAwarded,
            coinsTotal: p1CoinsTotal,
            matchDurationSec: durationSec,
            streakUpdate:
                p1Streak && p1Streak.advanced
                    ? {
                          playStreak: p1Streak.playStreak,
                          dailyCoins: p1Streak.dailyCoins,
                          milestone: p1Streak.milestone
                              ? {
                                    day: p1Streak.milestone.day,
                                    coins: p1Streak.milestone.coins,
                                    hintCredits: p1Streak.milestone.hintCredits,
                                }
                              : undefined,
                      }
                    : undefined,
        };
        const p2Payload: MatchOver = {
            matchId: match.id,
            result: p2Result,
            outcome,
            word: match.word,
            rankDelta: p2Delta,
            newRankPoints: updatedP2.rank_points,
            newRankTier: updatedP2.rank_tier as MatchOver['newRankTier'],
            battlePassXpAwarded: p2XpResult.xpAwarded,
            yourGuesses: match.p2Guesses.map((g) => ({ guess: g.guess, tiles: g.tiles })),
            opponentGuesses: match.p1Guesses.map((g) => ({ guess: g.guess, tiles: g.tiles })),
            coinsAwarded: p2CoinsAwarded,
            coinsTotal: p2CoinsTotal,
            matchDurationSec: durationSec,
            streakUpdate:
                p2Streak && p2Streak.advanced
                    ? {
                          playStreak: p2Streak.playStreak,
                          dailyCoins: p2Streak.dailyCoins,
                          milestone: p2Streak.milestone
                              ? {
                                    day: p2Streak.milestone.day,
                                    coins: p2Streak.milestone.coins,
                                    hintCredits: p2Streak.milestone.hintCredits,
                                }
                              : undefined,
                      }
                    : undefined,
        };
        if (match.p1SocketId) io.to(match.p1SocketId).emit('match_over', p1Payload);
        if (match.p2SocketId) io.to(match.p2SocketId).emit('match_over', p2Payload);

        this.byMatchId.delete(match.id);
        this.byUserId.delete(match.p1UserId);
        this.byUserId.delete(match.p2UserId);

        logger.info(
            { matchId: match.id, outcome, winner, durationSec },
            'Match ended'
        );
    }
}

function userToPublic(
    u: NonNullable<Awaited<ReturnType<typeof findUserById>>>
): PublicUser {
    return {
        id: u.id,
        username: u.username,
        provider: u.auth_provider,
        rankPoints: u.rank_points,
        rankTier: u.rank_tier as PublicUser['rankTier'],
        wins: u.wins,
        losses: u.losses,
        // isBot intentionally omitted — server keeps tracking p1_is_bot /
        // p2_is_bot in the matches table for analytics, but we never tell
        // the human which is which on the wire.
        equipped: {
            boardTheme: u.equipped_board_theme,
            victoryAnim: u.equipped_victory_anim,
            avatar: u.equipped_avatar,
            nameplate: u.equipped_nameplate,
            profileBorder: u.equipped_profile_border,
        },
    };
}

export const matchRegistry = new MatchRegistry();
