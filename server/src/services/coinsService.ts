// Coin currency. Coins are GRANTED from earn paths (streak, match win, ads,
// milestones) and SPENT on hints. Every change goes through grantCoins or
// spendCoins so the coin_grants audit log captures the source.

import { pool, query } from '../db/pool.js';

// ─── Pack catalog ───────────────────────────────────────────────────────────
//
// Server is the source of truth for prices and bonus amounts. Mobile fetches
// this list via GET /api/coins/packs so a price tweak doesn't require a new
// app build.
//
// productId values must match the product IDs you set up in App Store Connect
// and Google Play. Convention: dev.bonhomieinc.wordwar.coins.<id>

export interface CoinPack {
    id: string;
    name: string;
    description: string;
    coins: number;
    /** Display only — actual money flows through StoreKit / Play Billing. */
    priceUsd: number;
    productId: string;
    /** Highlight the best-value pack in the UI. */
    featured?: boolean;
    /** % bonus over the linear baseline ($0.99 → 100). For UI badges. */
    bonusPct?: number;
}

export const COIN_PACKS: readonly CoinPack[] = [
    {
        id: 'pebble',
        name: 'Pebble Pack',
        description: 'A handful of coins to top up.',
        coins: 100,
        priceUsd: 0.99,
        productId: 'dev.bonhomieinc.wordwar.coins.pebble',
    },
    {
        id: 'pocket',
        name: 'Pocket Pack',
        description: '550 coins — small bonus included.',
        coins: 550,
        priceUsd: 4.99,
        productId: 'dev.bonhomieinc.wordwar.coins.pocket',
        bonusPct: 10,
    },
    {
        id: 'treasure',
        name: 'Treasure Pack',
        description: 'Most popular.',
        coins: 1200,
        priceUsd: 9.99,
        productId: 'dev.bonhomieinc.wordwar.coins.treasure',
        featured: true,
        bonusPct: 20,
    },
    {
        id: 'vault',
        name: 'Vault Pack',
        description: 'For the long haul.',
        coins: 2700,
        priceUsd: 19.99,
        productId: 'dev.bonhomieinc.wordwar.coins.vault',
        bonusPct: 35,
    },
    {
        id: 'mega',
        name: 'Mega Vault',
        description: 'Best value per coin.',
        coins: 7500,
        priceUsd: 49.99,
        productId: 'dev.bonhomieinc.wordwar.coins.mega',
        bonusPct: 50,
    },
] as const;

export const HINT_COIN_COST = 50;

// ─── Grant / spend ──────────────────────────────────────────────────────────

export type CoinSource =
    | 'streak_daily'
    | 'streak_milestone'
    | 'match_win'
    | 'iap'
    | 'hint_spend'
    | 'ad_reward'
    | 'admin_grant';

/**
 * Grant coins to a user. amount must be positive. Source is recorded for
 * audit. Returns the new balance.
 */
export async function grantCoins(args: {
    userId: string;
    amount: number;
    source: CoinSource;
    metadata?: Record<string, unknown>;
}): Promise<number> {
    if (args.amount <= 0) throw new Error('grantCoins: amount must be positive');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query<{ coins: number }>(
            `UPDATE users SET coins = coins + $1, updated_at = now()
             WHERE id = $2 RETURNING coins`,
            [args.amount, args.userId]
        );
        await client.query(
            `INSERT INTO coin_grants (user_id, amount, source, metadata)
             VALUES ($1, $2, $3, $4)`,
            [args.userId, args.amount, args.source, args.metadata ?? {}]
        );
        await client.query('COMMIT');
        return r.rows[0]?.coins ?? 0;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Atomic spend. Returns the new balance on success, or null if the user
 * couldn't afford it. Caller checks for null.
 */
export async function spendCoins(args: {
    userId: string;
    amount: number;
    source: CoinSource;
    metadata?: Record<string, unknown>;
}): Promise<number | null> {
    if (args.amount <= 0) throw new Error('spendCoins: amount must be positive');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Conditional UPDATE — only succeeds if the user has enough coins.
        // This avoids the read/check/write race.
        const r = await client.query<{ coins: number }>(
            `UPDATE users SET coins = coins - $1, updated_at = now()
             WHERE id = $2 AND coins >= $1
             RETURNING coins`,
            [args.amount, args.userId]
        );
        if (r.rowCount === 0) {
            await client.query('ROLLBACK');
            return null;
        }
        await client.query(
            `INSERT INTO coin_grants (user_id, amount, source, metadata)
             VALUES ($1, $2, $3, $4)`,
            [args.userId, -args.amount, args.source, args.metadata ?? {}]
        );
        await client.query('COMMIT');
        return r.rows[0]?.coins ?? 0;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function getCoinBalance(userId: string): Promise<number> {
    const rows = await query<{ coins: number }>(
        'SELECT coins FROM users WHERE id = $1',
        [userId]
    );
    return rows[0]?.coins ?? 0;
}

// ─── Hint credits ───────────────────────────────────────────────────────────

export async function grantHintCredits(userId: string, amount: number): Promise<number> {
    if (amount <= 0) return 0;
    const rows = await query<{ hint_credits: number }>(
        `UPDATE users SET hint_credits = hint_credits + $1, updated_at = now()
         WHERE id = $2 RETURNING hint_credits`,
        [amount, userId]
    );
    return rows[0]?.hint_credits ?? 0;
}

// ─── IAP fulfilment ─────────────────────────────────────────────────────────

export async function fulfillCoinPackPurchase(args: {
    userId: string;
    packId: string;
    /** Receipt data from StoreKit / Play Billing. */
    receipt?: string;
}): Promise<{ pack: CoinPack; newBalance: number } | null> {
    const pack = COIN_PACKS.find((p) => p.id === args.packId);
    if (!pack) return null;
    // TODO(prod): verify args.receipt against App Store / Play before granting.
    const newBalance = await grantCoins({
        userId: args.userId,
        amount: pack.coins,
        source: 'iap',
        metadata: { packId: pack.id, productId: pack.productId },
    });
    return { pack, newBalance };
}
