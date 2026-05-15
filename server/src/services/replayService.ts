// Match replays.
//
// Every completed match gets a single row in match_replays containing both
// players' guesses, the answer, duration, and winner. Compact (text-only),
// so storage is cheap.
//
// Use cases:
//   - Players can view their recent matches as a list with outcomes
//   - Tap a replay to see the full board fill in (turn-by-turn, animated client-side)
//   - Foundation for spectator mode later (a live replay is just a slow
//     replay)

import { query } from '../db/pool.js';

export interface ReplayMeta {
    matchId: string;
    mode: string;
    word: string;
    wordLength: number;
    opponentUsername: string;
    youWon: boolean;
    outcome: string; // 'p1_solved' | 'p2_solved' | 'time_up' | 'disconnect'
    durationMs: number;
    createdAt: string;
}

export interface ReplayFull extends ReplayMeta {
    yourGuesses: { guess: string; tiles: string[] }[];
    opponentGuesses: { guess: string; tiles: string[] }[];
}

export async function saveReplay(args: {
    matchId: string;
    mode: string;
    word: string;
    p1UserId: string;
    p2UserId: string;
    p1Username: string;
    p2Username: string;
    p1Guesses: { guess: string; tiles: string[] }[];
    p2Guesses: { guess: string; tiles: string[] }[];
    winner: 'p1' | 'p2' | 'tie';
    outcome: string;
    durationMs: number;
    startedAtMs: number;
}): Promise<void> {
    await query(
        `INSERT INTO match_replays(
            match_id, mode, word, word_length,
            p1_user_id, p2_user_id, p1_username, p2_username,
            p1_guesses, p2_guesses, winner, outcome,
            duration_ms, started_at
         ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9::jsonb, $10::jsonb, $11, $12,
            $13, to_timestamp($14 / 1000.0)
         )
         ON CONFLICT (match_id) DO NOTHING`,
        [
            args.matchId,
            args.mode,
            args.word,
            args.word.length,
            args.p1UserId,
            args.p2UserId,
            args.p1Username,
            args.p2Username,
            JSON.stringify(args.p1Guesses),
            JSON.stringify(args.p2Guesses),
            args.winner,
            args.outcome,
            args.durationMs,
            args.startedAtMs,
        ]
    );
}

/**
 * List recent replays for a user. Joins both player slots so we get all
 * matches they participated in (as p1 or p2), then derives "you/opponent"
 * from the user's POV.
 */
export async function listReplaysForUser(
    userId: string,
    limit = 20
): Promise<ReplayMeta[]> {
    const rows = await query<{
        match_id: string;
        mode: string;
        word: string;
        word_length: number;
        p1_user_id: string;
        p1_username: string;
        p2_username: string;
        winner: string;
        outcome: string;
        duration_ms: number;
        created_at: Date;
    }>(
        `SELECT match_id, mode, word, word_length,
                p1_user_id, p1_username, p2_username,
                winner, outcome, duration_ms, created_at
         FROM match_replays
         WHERE p1_user_id = $1 OR p2_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
    );

    return rows.map((r) => {
        const isP1 = r.p1_user_id === userId;
        const opponentUsername = isP1 ? r.p2_username : r.p1_username;
        const youWon =
            (isP1 && r.winner === 'p1') || (!isP1 && r.winner === 'p2');
        return {
            matchId: r.match_id,
            mode: r.mode,
            word: r.word,
            wordLength: r.word_length,
            opponentUsername,
            youWon,
            outcome: r.outcome,
            durationMs: r.duration_ms,
            createdAt: r.created_at.toISOString(),
        };
    });
}

export async function getReplay(
    userId: string,
    matchId: string
): Promise<ReplayFull | null> {
    const rows = await query<{
        match_id: string;
        mode: string;
        word: string;
        word_length: number;
        p1_user_id: string;
        p1_username: string;
        p2_username: string;
        p1_guesses: { guess: string; tiles: string[] }[];
        p2_guesses: { guess: string; tiles: string[] }[];
        winner: string;
        outcome: string;
        duration_ms: number;
        created_at: Date;
    }>(
        `SELECT match_id, mode, word, word_length,
                p1_user_id, p1_username, p2_username,
                p1_guesses, p2_guesses, winner, outcome,
                duration_ms, created_at
         FROM match_replays
         WHERE match_id = $1
           AND (p1_user_id = $2 OR p2_user_id = $2)`,
        [matchId, userId]
    );
    const r = rows[0];
    if (!r) return null;
    const isP1 = r.p1_user_id === userId;
    return {
        matchId: r.match_id,
        mode: r.mode,
        word: r.word,
        wordLength: r.word_length,
        opponentUsername: isP1 ? r.p2_username : r.p1_username,
        youWon: (isP1 && r.winner === 'p1') || (!isP1 && r.winner === 'p2'),
        outcome: r.outcome,
        durationMs: r.duration_ms,
        createdAt: r.created_at.toISOString(),
        yourGuesses: isP1 ? r.p1_guesses : r.p2_guesses,
        opponentGuesses: isP1 ? r.p2_guesses : r.p1_guesses,
    };
}
