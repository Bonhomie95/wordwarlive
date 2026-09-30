import { col, registerIndexes } from '../db/mongo.js';
import { spendCoins } from './coinsService.js';

registerIndexes('cosmetics', [{ key: { id: 1 }, unique: true }]);
registerIndexes('user_cosmetics', [{ key: { user_id: 1, cosmetic_id: 1 }, unique: true }]);

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

interface UserCosmeticDoc {
    user_id: string;
    cosmetic_id: string;
    acquired_via: string;
    acquired_at: Date;
}

const COSMETIC_PROJECTION = {
    _id: 0, id: 1, category: 1, name: 1, description: 1, price_cents: 1, price_coins: 1,
    rarity: 1, render_data: 1, available_in_shop: 1,
} as const;

const cosmetics = () => col<CosmeticRow>('cosmetics');
const userCosmetics = () => col<UserCosmeticDoc>('user_cosmetics');

export async function listShopCosmetics(userId?: string): Promise<CosmeticRow[]> {
    const owned = userId ? await listOwnedCosmetics(userId) : [];
    return cosmetics()
        .find(
            { $or: [{ available_in_shop: true }, { id: { $in: owned } }] },
            { projection: COSMETIC_PROJECTION }
        )
        .sort({ category: 1, price_cents: 1 })
        .toArray();
}

export async function getCosmetic(id: string): Promise<CosmeticRow | null> {
    return cosmetics().findOne({ id }, { projection: COSMETIC_PROJECTION });
}

export async function ownsCosmetic(userId: string, cosmeticId: string): Promise<boolean> {
    const row = await userCosmetics().findOne(
        { user_id: userId, cosmetic_id: cosmeticId },
        { projection: { _id: 1 } }
    );
    return row !== null;
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
    const user = await col('users').findOne({ id: userId }, { projection: { _id: 1 } });
    if (!user) return { ok: false, error: 'NOT_FOUND' };
    const cos = await getCosmetic(cosmeticId);
    if (!cos || !cos.available_in_shop) return { ok: false, error: 'NOT_FOUND' };
    if (cos.price_coins <= 0) return { ok: false, error: 'NOT_FOR_COINS' };
    // Reserve the entitlement first (unique user_id+cosmetic_id) so racing
    // purchases can only charge once; release it if the wallet can't pay.
    const reserved = await userCosmetics().updateOne(
        { user_id: userId, cosmetic_id: cosmeticId },
        { $setOnInsert: { user_id: userId, cosmetic_id: cosmeticId, acquired_via: 'purchase', acquired_at: new Date() } },
        { upsert: true }
    );
    if (!reserved.upsertedCount) return { ok: false, error: 'ALREADY_OWNED' };
    const coins = await spendCoins({ userId, amount: cos.price_coins, source: 'cosmetic_spend', metadata: { cosmeticId } });
    if (coins === null) {
        await userCosmetics().deleteOne({ user_id: userId, cosmetic_id: cosmeticId, acquired_via: 'purchase' });
        return { ok: false, error: 'NOT_AFFORDABLE' };
    }
    return { ok: true, coins };
}

export async function listOwnedCosmetics(userId: string): Promise<string[]> {
    const rows = await userCosmetics()
        .find({ user_id: userId }, { projection: { _id: 0, cosmetic_id: 1 } })
        .toArray();
    return rows.map((r) => r.cosmetic_id);
}

/** Grants an entitlement. Store verification occurs in the purchase route
 * before this internal helper is invoked. */
export async function grantCosmetic(
    userId: string,
    cosmeticId: string,
    acquiredVia: 'purchase' | 'battle_pass' | 'season_reward' | 'grant' = 'purchase',
    _existing?: unknown
): Promise<void> {
    // For the 'purchase' path the store receipt is verified upstream in
    // routes/cosmetics.ts (verifyIapPurchase) before we get here. Other
    // acquiredVia values are internal grants and don't involve a receipt.
    const exists = await cosmetics().findOne({ id: cosmeticId }, { projection: { _id: 1 } });
    if (!exists) throw new Error('Cosmetic does not exist');
    // ON CONFLICT DO NOTHING
    await userCosmetics().updateOne(
        { user_id: userId, cosmetic_id: cosmeticId },
        { $setOnInsert: { acquired_via: acquiredVia, acquired_at: new Date() } },
        { upsert: true }
    );
}

export const STYLE_BUNDLE = { id: 'neon_fox', name: 'Neon Fox style set', cosmeticIds: ['avatar_fox_01', 'theme_neon'] };
export async function styleBundle(userId: string) {
    const items = await cosmetics()
        .find({ id: { $in: STYLE_BUNDLE.cosmeticIds }, available_in_shop: true, price_coins: { $gt: 0 } }, { projection: COSMETIC_PROJECTION })
        .toArray();
    if(items.length!==STYLE_BUNDLE.cosmeticIds.length) return null;
    const owned = new Set(await listOwnedCosmetics(userId));
    const missing = items.filter(c=>!owned.has(c.id));
    return {...STYLE_BUNDLE, missing:missing.map(c=>c.id), priceCoins:Math.ceil(missing.reduce((n,c)=>n+c.price_coins,0)*0.8), owned:missing.length===0};
}
export async function buyStyleBundle(userId:string, expectedPrice:number) {
    const offer = await styleBundle(userId);
    if(!offer || offer.owned || offer.priceCoins!==expectedPrice) return {ok:false,error:'Offer changed or already owned. Refresh the shop.'};
    const coins=await spendCoins({userId,amount:offer.priceCoins,source:'cosmetic_spend',metadata:{bundle:offer.id,items:offer.missing}});
    if(coins===null)return {ok:false,error:'Not enough coins.'};
    for(const id of offer.missing)await grantCosmetic(userId,id,'purchase');
    return {ok:true,coins};
}
