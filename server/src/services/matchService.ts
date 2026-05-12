// Persists a finished match to the DB. Called from the socket match handler
// once the engine reports GAME_OVER. Does the writes in a single transaction
// so we never end up with a half-written match.

import { pool } from '../db/pool.js';
import type { GuessResult, MatchOutcome } from '../game/engine.js';

export interface PersistMatchArgs {
    player1Id: string;
    player2Id: string;
    word: string;
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
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const matchRes = await client.query<{ id: string }>(
            `INSERT INTO matches
                (player1_id, player2_id, word, word_length, winner_id,
                 outcome, duration_seconds, p1_rank_delta, p2_rank_delta,
                 p1_is_bot, p2_is_bot, started_at, ended_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                     to_timestamp($12 / 1000.0), now())
             RETURNING id`,
            [
                args.player1Id,
                args.player2Id,
                args.word.toUpperCase(),
                args.word.length,
                args.winnerId,
                args.outcome,
                args.durationSeconds,
                args.p1RankDelta,
                args.p2RankDelta,
                args.p1IsBot,
                args.p2IsBot,
                args.startedAtMs,
            ]
        );
        const matchId = matchRes.rows[0]!.id;

        // Compute guess timestamps relative to start. We don't store per-guess
        // wall-clock here; the at_ms field is "ms after match start".
        const p1Sequence = args.p1Guesses.map((g, i) => ({
            guess: g.guess,
            tiles: g.tiles,
            // We don't actually have per-guess timestamps here without threading
            // them through; persist the index for now.
            i,
        }));
        const p2Sequence = args.p2Guesses.map((g, i) => ({
            guess: g.guess,
            tiles: g.tiles,
            i,
        }));

        await client.query(
            `INSERT INTO guesses (match_id, player_id, guess_sequence)
             VALUES ($1, $2, $3::jsonb)`,
            [matchId, args.player1Id, JSON.stringify(p1Sequence)]
        );
        await client.query(
            `INSERT INTO guesses (match_id, player_id, guess_sequence)
             VALUES ($1, $2, $3::jsonb)`,
            [matchId, args.player2Id, JSON.stringify(p2Sequence)]
        );

        await client.query('COMMIT');
        return matchId;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/** Recent matches for a user, with opponent info. */
export interface RecentMatch {
    id: string;
    word: string;
    outcome: string;
    isWin: boolean;
    rankDelta: number;
    opponentUsername: string;
    opponentIsBot: boolean;
    durationSeconds: number;
    endedAt: string;
}

export async function listRecentMatches(
    userId: string,
    limit = 25
): Promise<RecentMatch[]> {
    const { query } = await import('../db/pool.js');
    return query<RecentMatch>(
        `SELECT
            m.id,
            m.word,
            m.outcome,
            m.duration_seconds AS "durationSeconds",
            m.ended_at AS "endedAt",
            CASE WHEN m.player1_id = $1 THEN m.p1_rank_delta ELSE m.p2_rank_delta END AS "rankDelta",
            CASE WHEN m.winner_id = $1 THEN TRUE ELSE FALSE END AS "isWin",
            CASE WHEN m.player1_id = $1 THEN u2.username ELSE u1.username END AS "opponentUsername",
            CASE WHEN m.player1_id = $1 THEN m.p2_is_bot ELSE m.p1_is_bot END AS "opponentIsBot"
         FROM matches m
         JOIN users u1 ON u1.id = m.player1_id
         JOIN users u2 ON u2.id = m.player2_id
         WHERE m.player1_id = $1 OR m.player2_id = $1
         ORDER BY m.ended_at DESC
         LIMIT $2`,
        [userId, limit]
    );
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
    const { query } = await import('../db/pool.js');
    const rows = await query<{ is_win: boolean; outcome: string }>(
        `SELECT
            (winner_id = $1) AS is_win,
            outcome
         FROM matches
         WHERE player1_id = $1 OR player2_id = $1
         ORDER BY ended_at DESC
         LIMIT 5`,
        [userId]
    );

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
