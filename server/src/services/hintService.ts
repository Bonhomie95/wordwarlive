// Hint logic.
//
// Rules (locked design):
//   - At most ONE hint per match, regardless of how it's paid for. The match
//     handler enforces this via hintsUsedInMatch and refuses subsequent
//     requests with PER_MATCH_LIMIT.
//   - The first hint a user EVER takes (across all matches) is FREE. We
//     track this on users.lifetime_hints_used.
//   - Every subsequent hint costs 50 coins, OR 1 hint_credit (granted by
//     streak milestones — credits act as a discount, but the user still
//     uses up their per-match hint slot).
//
// Server is authoritative — picks the position, bills the user, logs.

import { pool, query } from '../db/pool.js';
import { spendCoins, HINT_COIN_COST } from './coinsService.js';
import type { GuessResult } from '../game/engine.js';

export interface HintResult {
    ok: true;
    /** 0-indexed position in the target word. */
    position: number;
    letter: string;
    paidWith: 'free' | 'credit' | 'coins';
    coinsSpent: number;
    /** Updated user counters so the client can refresh without /me. */
    coinsRemaining: number;
    hintCreditsRemaining: number;
    /** Updated lifetime counter so the client knows the next hint is no longer free. */
    lifetimeHintsUsed: number;
}

export interface HintError {
    ok: false;
    error:
        | 'NO_POSITIONS_LEFT'   // every position is already greened in their grid
        | 'NOT_AFFORDABLE'      // no credits + insufficient coins
        | 'PER_MATCH_LIMIT'     // already used their one hint this match
        | 'NOT_FOUND';
}

/**
 * Pick a position to reveal. We pick from positions where the player has
 * NOT yet placed the correct letter (no green tile at that index in any
 * of their guesses).
 */
export function pickHintPosition(
    target: string,
    history: GuessResult[]
): { position: number; letter: string } | null {
    const t = target.toUpperCase();
    const greened = new Set<number>();
    for (const g of history) {
        for (let i = 0; i < g.tiles.length; i++) {
            if (g.tiles[i] === 'correct') greened.add(i);
        }
    }
    const candidates: number[] = [];
    for (let i = 0; i < t.length; i++) {
        if (!greened.has(i)) candidates.push(i);
    }
    if (candidates.length === 0) return null;
    const pos = candidates[Math.floor(Math.random() * candidates.length)]!;
    return { position: pos, letter: t[pos]! };
}

interface RedeemArgs {
    userId: string;
    matchId: string;
    target: string;
    history: GuessResult[];
}

export async function redeemHint(args: RedeemArgs): Promise<HintResult | HintError> {
    const pick = pickHintPosition(args.target, args.history);
    if (!pick) return { ok: false, error: 'NO_POSITIONS_LEFT' };

    // Read user state for the waterfall decision.
    const userRows = await query<{
        coins: number;
        hint_credits: number;
        lifetime_hints_used: number;
    }>(
        `SELECT coins, hint_credits, lifetime_hints_used FROM users WHERE id = $1`,
        [args.userId]
    );
    const u = userRows[0];
    if (!u) return { ok: false, error: 'NOT_FOUND' };

    // Payment waterfall: lifetime-first → credits → coins.
    //
    // Even on the lifetime-first free path we still increment
    // lifetime_hints_used so the next request is no longer free.
    let paidWith: 'free' | 'credit' | 'coins';
    let coinsSpent = 0;
    let coinsRemaining = u.coins;
    let hintCreditsRemaining = u.hint_credits;

    if (u.lifetime_hints_used === 0) {
        paidWith = 'free';
    } else if (u.hint_credits > 0) {
        // Conditional UPDATE — atomic decrement, no race.
        const r = await query<{ hint_credits: number }>(
            `UPDATE users SET hint_credits = hint_credits - 1, updated_at = now()
             WHERE id = $1 AND hint_credits > 0 RETURNING hint_credits`,
            [args.userId]
        );
        if (r.length === 0) {
            // Lost the race for the credit; fall through to coins.
            const newBal = await spendCoins({
                userId: args.userId,
                amount: HINT_COIN_COST,
                source: 'hint_spend',
                metadata: { matchId: args.matchId },
            });
            if (newBal === null) return { ok: false, error: 'NOT_AFFORDABLE' };
            paidWith = 'coins';
            coinsSpent = HINT_COIN_COST;
            coinsRemaining = newBal;
        } else {
            paidWith = 'credit';
            hintCreditsRemaining = r[0]!.hint_credits;
        }
    } else if (u.coins >= HINT_COIN_COST) {
        const newBal = await spendCoins({
            userId: args.userId,
            amount: HINT_COIN_COST,
            source: 'hint_spend',
            metadata: { matchId: args.matchId },
        });
        if (newBal === null) return { ok: false, error: 'NOT_AFFORDABLE' };
        paidWith = 'coins';
        coinsSpent = HINT_COIN_COST;
        coinsRemaining = newBal;
    } else {
        return { ok: false, error: 'NOT_AFFORDABLE' };
    }

    // Increment lifetime counter.
    const lifetimeRow = await query<{ lifetime_hints_used: number }>(
        `UPDATE users SET lifetime_hints_used = lifetime_hints_used + 1,
                          updated_at = now()
         WHERE id = $1 RETURNING lifetime_hints_used`,
        [args.userId]
    );
    const lifetimeHintsUsed =
        lifetimeRow[0]?.lifetime_hints_used ?? u.lifetime_hints_used + 1;

    // Audit log.
    await query(
        `INSERT INTO hint_uses (match_id, user_id, paid_with, coins_spent, position, letter)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [args.matchId, args.userId, paidWith, coinsSpent, pick.position, pick.letter]
    );

    return {
        ok: true,
        position: pick.position,
        letter: pick.letter,
        paidWith,
        coinsSpent,
        coinsRemaining,
        hintCreditsRemaining,
        lifetimeHintsUsed,
    };
}

export { HINT_COIN_COST };

// Reference imports so linters don't whine.
void pool;
