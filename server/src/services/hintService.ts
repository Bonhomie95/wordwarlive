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

import { col, newId, registerIndexes } from '../db/mongo.js';
import { spendCoins, HINT_COIN_COST } from './coinsService.js';
import type { GuessResult } from '../game/engine.js';

registerIndexes('hint_uses', [
    { key: { id: 1 }, unique: true },
    { key: { match_id: 1, user_id: 1 } },
]);

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
    history: GuessResult[],
    excluded: number[] = []
): { position: number; letter: string } | null {
    const t = target.toUpperCase();
    const greened = new Set<number>(excluded);
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
    excluded?: number[];
}

export async function redeemHint(args: RedeemArgs): Promise<HintResult | HintError> {
    const users = col<{ id: string; coins: number; hint_credits: number; lifetime_hints_used: number }>('users');
    const u = await users.findOne({ id: args.userId }, { projection: { _id: 0, coins: 1, hint_credits: 1, lifetime_hints_used: 1 } });
    if (!u) return { ok: false, error: 'NOT_FOUND' };
    const prior = await col<{ position: number }>('hint_uses')
        .find({ match_id: args.matchId, user_id: args.userId }, { projection: { _id: 0, position: 1 } }).toArray();
    if (prior.length >= (args.target.length >= 8 ? 2 : 1)) return { ok: false, error: 'PER_MATCH_LIMIT' };
    const pick = pickHintPosition(args.target, args.history, [...(args.excluded ?? []), ...prior.map((h) => h.position)]);
    if (!pick) return { ok: false, error: 'NO_POSITIONS_LEFT' };
    const paidWith = u.lifetime_hints_used === 0 ? 'free' : u.hint_credits > 0 ? 'credit' : 'coins';
    const coinsSpent = paidWith === 'coins' ? HINT_COIN_COST : 0;
    let coinsRemaining = u.coins;
    if (coinsSpent) {
        const balance = await spendCoins({ userId: args.userId, amount: coinsSpent, source: 'hint_spend', metadata: { matchId: args.matchId } });
        if (balance === null) return { ok: false, error: 'NOT_AFFORDABLE' };
        coinsRemaining = balance;
    }
    const creditUsed = paidWith === 'credit' ? 1 : 0;
    // ponytail: no row lock — the $gte filter keeps hint_credits non-negative if two hints race.
    const r = await users.updateOne(
        creditUsed ? { id: args.userId, hint_credits: { $gte: 1 } } : { id: args.userId },
        { $inc: creditUsed ? { hint_credits: -1, lifetime_hints_used: 1 } : { lifetime_hints_used: 1 }, $set: { updated_at: new Date() } }
    );
    if (!r.matchedCount) return { ok: false, error: 'NOT_AFFORDABLE' };
    await col('hint_uses').insertOne({
        id: newId(), match_id: args.matchId, user_id: args.userId, paid_with: paidWith,
        coins_spent: coinsSpent, position: pick.position, letter: pick.letter, used_at: new Date(),
    });
    return { ok: true, ...pick, paidWith, coinsSpent, coinsRemaining, hintCreditsRemaining: u.hint_credits - creditUsed, lifetimeHintsUsed: u.lifetime_hints_used + 1 };
}

export { HINT_COIN_COST };
