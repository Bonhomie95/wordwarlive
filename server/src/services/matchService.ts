// Persists a finished match to the DB. Called from the socket match handler
// once the engine reports GAME_OVER.

import { col, newId, registerIndexes } from '../db/mongo.js';
import type { GuessResult, MatchOutcome } from '../game/engine.js';

registerIndexes('matches', [
    { key: { id: 1 }, unique: true },
    { key: { player1_id: 1, ended_at: -1 } },
    { key: { player2_id: 1, ended_at: -1 } },
]);
registerIndexes('guesses', [
    { key: { id: 1 }, unique: true },
    { key: { match_id: 1 } },
]);

export interface PersistMatchArgs {
    /** In-memory match id, also used by match_replays.match_id. */
    matchId: string;
    player1Id: string;
    player2Id: string;
    /** Player 1's target word. */
    word: string;
    /** Player 2's target word when it differs (mystery matches); null when
     *  both players raced the same word. */
    p2Word?: string | null;
    durationSeconds: number;
    outcome: MatchOutcome;
    winnerId: string | null;
    p1RankDelta: number;
    p2RankDelta: number;
    p1IsBot: boolean;
    p2IsBot: boolean;
    p1Guesses: GuessResult[];
    p2Guesses: GuessResult[];
    /** ms since epoch when the match started; used so duration is accurate. */
    startedAtMs: number;
}

export async function persistMatch(args: PersistMatchArgs): Promise<string> {
    // ponytail: no multi-doc transaction; matches + guesses are three inserts.
    // Re-running after a crash is safe: the unique id index rejects a dup match.
    await col('matches').insertOne({
        id: args.matchId,
        player1_id: args.player1Id,
        player2_id: args.player2Id,
        word: args.word.toUpperCase(),
        p2_word: args.p2Word ? args.p2Word.toUpperCase() : null,
        word_length: args.word.length,
        winner_id: args.winnerId,
        outcome: args.outcome,
        duration_seconds: args.durationSeconds,
        p1_rank_delta: args.p1RankDelta,
        p2_rank_delta: args.p2RankDelta,
        p1_is_bot: args.p1IsBot,
        p2_is_bot: args.p2IsBot,
        started_at: new Date(args.startedAtMs),
        ended_at: new Date(),
        mode: 'classic',
    });

    // at_ms is not threaded through; persist the index for now.
    const seq = (gs: GuessResult[]) => gs.map((g, i) => ({ guess: g.guess, tiles: g.tiles, i }));
    await col('guesses').insertMany([
        { id: newId(), match_id: args.matchId, player_id: args.player1Id, guess_sequence: seq(args.p1Guesses) },
        { id: newId(), match_id: args.matchId, player_id: args.player2Id, guess_sequence: seq(args.p2Guesses) },
    ]);
    return args.matchId;
}

/** Recent matches for a user, with opponent info.
 *
 *  Deliberately NO bot flag here: bots present as regular players on the
 *  wire (product decision — early-stage matchmaking leans on bots, and
 *  labeling them would make the game feel empty). p1_is_bot / p2_is_bot
 *  stay in the DB for analytics only. */
export interface RecentMatch {
    id: string;
    word: string;
    outcome: string;
    isWin: boolean;
    rankDelta: number;
    opponentUsername: string;
    durationSeconds: number;
    endedAt: string;
}

interface MatchDoc {
    id: string;
    player1_id: string;
    player2_id: string;
    word: string;
    p2_word: string | null;
    winner_id: string | null;
    outcome: string;
    duration_seconds: number;
    p1_rank_delta: number;
    p2_rank_delta: number;
    ended_at: Date;
}

function recentMatchDocs(userId: string, limit: number): Promise<MatchDoc[]> {
    return col<MatchDoc>('matches')
        .find({ $or: [{ player1_id: userId }, { player2_id: userId }] }, { projection: { _id: 0 } })
        .sort({ ended_at: -1 })
        .limit(limit)
        .toArray();
}

export async function listRecentMatches(
    userId: string,
    limit = 25
): Promise<RecentMatch[]> {
    const docs = await recentMatchDocs(userId, limit);
    const ids = [...new Set(docs.flatMap((m) => [m.player1_id, m.player2_id]))];
    const users = await col<{ id: string; username: string }>('users')
        .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, username: 1 } })
        .toArray();
    const names = new Map(users.map((u) => [u.id, u.username]));
    // Inner JOIN semantics: drop matches whose users no longer exist.
    return docs
        .filter((m) => names.has(m.player1_id) && names.has(m.player2_id))
        .map((m) => {
            const isP1 = m.player1_id === userId;
            return {
                id: m.id,
                word: isP1 ? m.word : m.p2_word ?? m.word,
                outcome: m.outcome,
                durationSeconds: m.duration_seconds,
                endedAt: m.ended_at.toISOString(),
                rankDelta: isP1 ? m.p1_rank_delta : m.p2_rank_delta,
                isWin: m.winner_id === userId,
                opponentUsername: names.get(isP1 ? m.player2_id : m.player1_id)!,
            };
        });
}

/**
 * Summarise the player's recent results, used to drive adaptive bot
 * difficulty. Looks at the last 5 completed matches.
 *
 * Returns zeros (a neutral baseline) for new players with no history.
 */
export async function getRecentResultsSummary(userId: string): Promise<{
    consecutiveWins: number;
    consecutiveLosses: number;
    recentWins: number;
    recentTotal: number;
}> {
    const rows = (await recentMatchDocs(userId, 5)).map((m) => ({
        is_win: m.winner_id === userId,
        outcome: m.outcome,
    }));

    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let streakDone = false;
    let recentWins = 0;
    for (const r of rows) {
        if (r.is_win) recentWins += 1;
        if (!streakDone) {
            if (r.is_win) {
                if (consecutiveLosses === 0) consecutiveWins += 1;
                else streakDone = true;
            } else if (r.outcome === 'tie') {
                // Tie breaks any streak.
                streakDone = true;
            } else {
                if (consecutiveWins === 0) consecutiveLosses += 1;
                else streakDone = true;
            }
        }
    }
    return {
        consecutiveWins,
        consecutiveLosses,
        recentWins,
        recentTotal: rows.length,
    };
}
