import { query, pool } from '../db/pool.js';
import { grantCoins, spendCoins } from './coinsService.js';

export interface CosmeticRow {
    id: string;
    category:
        | 'board_theme'
        | 'victory_anim'
        | 'avatar'
        | 'nameplate'
        | 'profile_border';
    name: string;
    description: string | null;
    price_cents: number;
    /** Coin price, or 0 when the item is cash-only. */
    price_coins: number;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    render_data: Record<string, unknown>;
    available_in_shop: boolean;
}

export async function listShopCosmetics(): Promise<CosmeticRow[]> {
    return query<CosmeticRow>(
        `SELECT id, category, name, description, price_cents, price_coins, rarity,
                render_data, available_in_shop
         FROM cosmetics WHERE available_in_shop = TRUE
         ORDER BY category, price_cents ASC`
    );
}

export async function getCosmetic(id: string): Promise<CosmeticRow | null> {
    const rows = await query<CosmeticRow>(
        `SELECT id, category, name, description, price_cents, price_coins, rarity,
                render_data, available_in_shop
         FROM cosmetics WHERE id = $1`,
        [id]
    );
    return rows[0] ?? null;
}

export async function ownsCosmetic(userId: string, cosmeticId: string): Promise<boolean> {
    const rows = await query(
        'SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND cosmetic_id = $2',
        [userId, cosmeticId]
    );
    return rows.length > 0;
}

/**
 * Buy a cosmetic with coins (the alternative to the store purchase). Charges
 * first, grants second, refunds if the grant fails.
 */
export async function purchaseCosmeticWithCoins(
    userId: string,
    cosmeticId: string
): Promise<
    | { ok: true; coins: number }
    | { ok: false; error: 'NOT_FOUND' | 'NOT_FOR_COINS' | 'ALREADY_OWNED' | 'NOT_AFFORDABLE' }
> {
    const cos = await getCosmetic(cosmeticId);
    if (!cos || !cos.available_in_shop) return { ok: false, error: 'NOT_FOUND' };
    if (cos.price_coins <= 0) return { ok: false, error: 'NOT_FOR_COINS' };
    if (await ownsCosmetic(userId, cosmeticId)) return { ok: false, error: 'ALREADY_OWNED' };
    const coins = await spendCoins({
        userId,
        amount: cos.price_coins,
        source: 'cosmetic_spend',
        metadata: { cosmeticId },
    });
    if (coins === null) return { ok: false, error: 'NOT_AFFORDABLE' };
    try {
        await grantCosmetic(userId, cosmeticId, 'purchase');
    } catch (err) {
        await grantCoins({ userId, amount: cos.price_coins, source: 'cosmetic_spend', metadata: { refund: cosmeticId } });
        throw err;
    }
    return { ok: true, coins };
}

export async function listOwnedCosmetics(userId: string): Promise<string[]> {
    const rows = await query<{ cosmetic_id: string }>(
        'SELECT cosmetic_id FROM user_cosmetics WHERE user_id = $1',
        [userId]
    );
    return rows.map((r) => r.cosmetic_id);
}

/**
 * "Purchase" a cosmetic. We don't take real money in this codepath — that
 * happens client-side via App Store / Play Store IAP, then the receipt is
 * verified by the store and the client tells us "grant me item X". A real
 * production path would verify the receipt server-side; here we treat the
 * client request as authoritative for development. Mark as TODO.
 */
export async function grantCosmetic(
    userId: string,
    cosmeticId: string,
    acquiredVia: 'purchase' | 'battle_pass' | 'season_reward' | 'grant' = 'purchase'
): Promise<void> {
    // For the 'purchase' path the store receipt is verified upstream in
    // routes/cosmetics.ts (verifyIapPurchase) before we get here. Other
    // acquiredVia values are internal grants and don't involve a receipt.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const existsRes = await client.query(
            'SELECT 1 FROM cosmetics WHERE id = $1',
            [cosmeticId]
        );
        if (existsRes.rowCount === 0) throw new Error('Cosmetic does not exist');

        await client.query(
            `INSERT INTO user_cosmetics (user_id, cosmetic_id, acquired_via)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [userId, cosmeticId, acquiredVia]
        );
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
