import type { PoolClient } from 'pg';
import { query, pool, transaction } from '../db/pool.js';
import { spendCoins } from './coinsService.js';

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

export async function listShopCosmetics(userId?: string): Promise<CosmeticRow[]> {
    return query<CosmeticRow>(
        `SELECT id, category, name, description, price_cents, price_coins, rarity,
                render_data, available_in_shop
         FROM cosmetics WHERE available_in_shop = TRUE OR EXISTS (SELECT 1 FROM user_cosmetics uc WHERE uc.cosmetic_id = cosmetics.id AND uc.user_id = $1)
         ORDER BY category, price_cents ASC`, [userId ?? null]
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
    return transaction(async (client) => {
        const user = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (!user.rowCount) return { ok: false, error: 'NOT_FOUND' };
        const cos = await getCosmetic(cosmeticId);
        if (!cos || !cos.available_in_shop) return { ok: false, error: 'NOT_FOUND' };
        if (cos.price_coins <= 0) return { ok: false, error: 'NOT_FOR_COINS' };
        const owned = await client.query('SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND cosmetic_id = $2', [userId, cosmeticId]);
        if (owned.rowCount) return { ok: false, error: 'ALREADY_OWNED' };
        const coins = await spendCoins({ userId, amount: cos.price_coins, source: 'cosmetic_spend', metadata: { cosmeticId } }, client);
        if (coins === null) return { ok: false, error: 'NOT_AFFORDABLE' };
        await grantCosmetic(userId, cosmeticId, 'purchase', client);
        return { ok: true, coins };
    });
}

export async function listOwnedCosmetics(userId: string): Promise<string[]> {
    const rows = await query<{ cosmetic_id: string }>(
        'SELECT cosmetic_id FROM user_cosmetics WHERE user_id = $1',
        [userId]
    );
    return rows.map((r) => r.cosmetic_id);
}

/** Grants an entitlement inside the caller's transaction. Store verification
 * occurs in the purchase route before this internal helper is invoked. */
export async function grantCosmetic(
    userId: string,
    cosmeticId: string,
    acquiredVia: 'purchase' | 'battle_pass' | 'season_reward' | 'grant' = 'purchase',
    existing?: PoolClient
): Promise<void> {
    // For the 'purchase' path the store receipt is verified upstream in
    // routes/cosmetics.ts (verifyIapPurchase) before we get here. Other
    // acquiredVia values are internal grants and don't involve a receipt.
    return transaction(async (client) => {
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
    }, existing);
}

export const STYLE_BUNDLE = { id: 'neon_fox', name: 'Neon Fox style set', cosmeticIds: ['avatar_fox_01', 'theme_neon'] };
export async function styleBundle(userId: string) {
    const items = await query<CosmeticRow>(`SELECT * FROM cosmetics WHERE id=ANY($1::text[]) AND available_in_shop AND price_coins>0`, [STYLE_BUNDLE.cosmeticIds]);
    if(items.length!==STYLE_BUNDLE.cosmeticIds.length) return null;
    const owned = new Set(await listOwnedCosmetics(userId));
    const missing = items.filter(c=>!owned.has(c.id));
    return {...STYLE_BUNDLE, missing:missing.map(c=>c.id), priceCoins:Math.ceil(missing.reduce((n,c)=>n+c.price_coins,0)*0.8), owned:missing.length===0};
}
export async function buyStyleBundle(userId:string, expectedPrice:number) {
    return transaction(async client=>{
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
        const offer = await styleBundle(userId);
        if(!offer || offer.owned || offer.priceCoins!==expectedPrice) return {ok:false,error:'Offer changed or already owned. Refresh the shop.'};
        const coins=await spendCoins({userId,amount:offer.priceCoins,source:'cosmetic_spend',metadata:{bundle:offer.id,items:offer.missing}},client);
        if(coins===null)return {ok:false,error:'Not enough coins.'};
        for(const id of offer.missing)await grantCosmetic(userId,id,'purchase',client);
        return {ok:true,coins};
    });
}
