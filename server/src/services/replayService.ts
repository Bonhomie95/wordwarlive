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

import { col, registerIndexes } from '../db/mongo.js';

registerIndexes('match_replays', [
    { key: { match_id: 1 }, unique: true },
    { key: { p1_user_id: 1, created_at: -1 } },
    { key: { p2_user_id: 1, created_at: -1 } },
]);

interface ReplayDoc {
    match_id: string;
    mode: string;
    word: string;
    p2_word: string | null;
    word_length: number;
    p1_user_id: string;
    p2_user_id: string;
    p1_username: string;
    p2_username: string;
    p1_guesses: { guess: string; tiles: string[] }[];
    p2_guesses: { guess: string; tiles: string[] }[];
    winner: string;
    outcome: string;
    duration_ms: number;
    started_at: Date;
    created_at: Date;
}

export interface ReplayMeta {
    matchId: string;
    mode: string;
    word: string;
    wordLength: number;
    opponentUsername: string;
    youWon: boolean;
    tied: boolean;
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
    /** Player 1's target word. */
    word: string;
    /** Player 2's target word when it differs (mystery); null otherwise. */
    p2Word?: string | null;
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
    // ON CONFLICT (match_id) DO NOTHING
    await col<ReplayDoc>('match_replays').updateOne(
        { match_id: args.matchId },
        {
            $setOnInsert: {
                match_id: args.matchId,
                mode: args.mode,
                word: args.word,
                p2_word: args.p2Word ?? null,
                word_length: args.word.length,
                p1_user_id: args.p1UserId,
                p2_user_id: args.p2UserId,
                p1_username: args.p1Username,
                p2_username: args.p2Username,
                p1_guesses: args.p1Guesses,
                p2_guesses: args.p2Guesses,
                winner: args.winner,
                outcome: args.outcome,
                duration_ms: args.durationMs,
                started_at: new Date(args.startedAtMs),
                created_at: new Date(),
            },
        },
        { upsert: true }
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
    const rows = await col<ReplayDoc>('match_replays')
        .find({ $or: [{ p1_user_id: userId }, { p2_user_id: userId }] }, { projection: { _id: 0 } })
        .sort({ created_at: -1 })
        .limit(limit)
        .toArray();

    return rows.map((r) => {
        const isP1 = r.p1_user_id === userId;
        const opponentUsername = isP1 ? r.p2_username : r.p1_username;
        const youWon =
            (isP1 && r.winner === 'p1') || (!isP1 && r.winner === 'p2');
        return {
            matchId: r.match_id,
            mode: r.mode,
            word: isP1 ? r.word : r.p2_word ?? r.word,
            wordLength: r.word_length,
            opponentUsername,
            youWon,
            tied: r.winner === 'tie',
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
    const r = await col<ReplayDoc>('match_replays').findOne(
        { match_id: matchId, $or: [{ p1_user_id: userId }, { p2_user_id: userId }] },
        { projection: { _id: 0 } }
    );
    if (!r) return null;
    const isP1 = r.p1_user_id === userId;
    return {
        matchId: r.match_id,
        mode: r.mode,
        word: isP1 ? r.word : r.p2_word ?? r.word,
        wordLength: r.word_length,
        opponentUsername: isP1 ? r.p2_username : r.p1_username,
        youWon: (isP1 && r.winner === 'p1') || (!isP1 && r.winner === 'p2'),
        tied: r.winner === 'tie',
        outcome: r.outcome,
        durationMs: r.duration_ms,
        createdAt: r.created_at.toISOString(),
        yourGuesses: isP1 ? r.p1_guesses : r.p2_guesses,
        opponentGuesses: isP1 ? r.p2_guesses : r.p1_guesses,
    };
}
