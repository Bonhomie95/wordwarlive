// Coin currency. Coins are GRANTED from earn paths (streak, match win, ads,
// milestones) and SPENT on hints. Every change goes through grantCoins or
// spendCoins so the coin_grants audit log captures the source.

import { col, newId, registerIndexes } from '../db/mongo.js';

registerIndexes('users', [{ key: { id: 1 }, unique: true }]);
registerIndexes('coin_grants', [
    { key: { id: 1 }, unique: true },
    { key: { user_id: 1, created_at: -1 } },
]);

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

/** One-time starter bundle: a cheap, high-value first purchase. Store product
 *  is NON-consumable (one per Apple/Google account) and the server also caps it
 *  to one per WordWar account (users.starter_bundle_at). */
export const STARTER_BUNDLE = {
    id: 'starter',
    name: 'Starter Bundle',
    description: '500 coins + Fox avatar + Neon Pulse board theme. One time only.',
    coins: 500,
    cosmeticIds: ['avatar_fox_01', 'theme_neon'],
    priceUsd: 2.99,
    productId: 'dev.bonhomieinc.wordwar.bundle.starter',
} as const;

// ─── Grant / spend ──────────────────────────────────────────────────────────

export type CoinSource =
    | 'streak_daily'
    | 'streak_milestone'
    | 'match_win'
    | 'match_play'
    | 'daily_solve'
    | 'iap'
    | 'hint_spend'
    | 'ad_reward'
    | 'admin_grant'
    | 'cosmetic_spend'
    | 'boost_spend'
    | 'username_spend'
    | 'bundle';

// Match coins. Small on purpose (a hint is 50): a win pays a hint every
// five games, a loser still edges toward one. Nothing for quitting or for a
// match with zero guesses, so re-queue-and-forfeit can't farm coins.
export const COINS_MATCH_WIN = 10;
export const COINS_MATCH_TIE = 5;
export const COINS_MATCH_LOSS = 3;

export function matchCoins(args: {
    result: 'win' | 'loss' | 'tie';
    /** This player quit / disconnected out of the match. */
    forfeited: boolean;
    /** This player submitted at least one guess. */
    guessed: boolean;
}): number {
    if (args.forfeited) return 0;
    if (args.result === 'win') return COINS_MATCH_WIN;
    if (!args.guessed) return 0;
    return args.result === 'tie' ? COINS_MATCH_TIE : COINS_MATCH_LOSS;
}

async function logGrant(userId: string, amount: number, source: CoinSource, metadata?: Record<string, unknown>): Promise<void> {
    await col('coin_grants').insertOne({
        id: newId(), user_id: userId, amount, source, metadata: metadata ?? {}, created_at: new Date(),
    });
}

/**
 * Grant coins to a user. amount must be positive. Source is recorded for
 * audit. Returns the new balance.
 */
export async function grantCoins(args: {
    userId: string;
    amount: number;
    source: CoinSource;
    metadata?: Record<string, unknown>;
}, _existing?: unknown): Promise<number> {
    if (args.amount <= 0) throw new Error('grantCoins: amount must be positive');
    const u = await col<{ coins: number }>('users').findOneAndUpdate(
        { id: args.userId },
        { $inc: { coins: args.amount }, $set: { updated_at: new Date() } },
        { returnDocument: 'after', projection: { _id: 0, coins: 1 } }
    );
    await logGrant(args.userId, args.amount, args.source, args.metadata);
    return u?.coins ?? 0;
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
}, _existing?: unknown): Promise<number | null> {
    if (args.amount <= 0) throw new Error('spendCoins: amount must be positive');
    // Conditional $inc — only matches if the user has enough coins, so the
    // balance can never go negative and there is no read/check/write race.
    const u = await col<{ coins: number }>('users').findOneAndUpdate(
        { id: args.userId, coins: { $gte: args.amount } },
        { $inc: { coins: -args.amount }, $set: { updated_at: new Date() } },
        { returnDocument: 'after', projection: { _id: 0, coins: 1 } }
    );
    if (!u) return null;
    await logGrant(args.userId, -args.amount, args.source, args.metadata);
    return u.coins ?? 0;
}

export async function getCoinBalance(userId: string): Promise<number> {
    const u = await col<{ coins: number }>('users').findOne({ id: userId }, { projection: { _id: 0, coins: 1 } });
    return u?.coins ?? 0;
}

// ─── Hint credits ───────────────────────────────────────────────────────────

export async function grantHintCredits(userId: string, amount: number): Promise<number> {
    if (amount <= 0) return 0;
    const u = await col<{ hint_credits: number }>('users').findOneAndUpdate(
        { id: userId },
        { $inc: { hint_credits: amount }, $set: { updated_at: new Date() } },
        { returnDocument: 'after', projection: { _id: 0, hint_credits: 1 } }
    );
    return u?.hint_credits ?? 0;
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
    // Receipt is verified upstream in the route via verifyIapPurchase() before
    // this runs (see routes/coins.ts). This function just grants the coins.
    const newBalance = await grantCoins({
        userId: args.userId,
        amount: pack.coins,
        source: 'iap',
        metadata: { packId: pack.id, productId: pack.productId },
    });
    return { pack, newBalance };
}
