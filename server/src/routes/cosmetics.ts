import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import {
    getCosmetic,
    grantCosmetic,
    listOwnedCosmetics,
    listShopCosmetics,
} from '../services/cosmeticsService.js';

export const cosmeticsRouter = Router();

function shape(c: Awaited<ReturnType<typeof listShopCosmetics>>[number], owned: Set<string>) {
    return {
        id: c.id,
        category: c.category,
        name: c.name,
        description: c.description,
        priceCents: c.price_cents,
        rarity: c.rarity,
        renderData: c.render_data,
        availableInShop: c.available_in_shop,
        owned: owned.has(c.id),
    };
}

cosmeticsRouter.get('/cosmetics', requireAuth, async (req, res) => {
    const [items, owned] = await Promise.all([
        listShopCosmetics(),
        listOwnedCosmetics(req.session!.userId),
    ]);
    const ownedSet = new Set(owned);
    res.json({ cosmetics: items.map((c) => shape(c, ownedSet)) });
});

cosmeticsRouter.get('/me/cosmetics', requireAuth, async (req, res) => {
    const owned = await listOwnedCosmetics(req.session!.userId);
    res.json({ owned });
});

const purchaseSchema = z.object({
    cosmeticId: z.string().min(1),
    /** Receipt from App Store / Play Store. Required in production. */
    receipt: z.string().optional(),
});

cosmeticsRouter.post('/cosmetics/:id/purchase', requireAuth, async (req, res) => {
    const cosmeticId = req.params.id!;
    const parsed = purchaseSchema.safeParse({ ...req.body, cosmeticId });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });

    const cos = await getCosmetic(cosmeticId);
    if (!cos) return res.status(404).json({ error: 'Cosmetic not found' });
    if (!cos.available_in_shop) {
        return res.status(400).json({ error: 'Not available for purchase' });
    }

    // TODO(prod): verify the receipt with Apple / Google here. For now we
    // just grant — this is a dev-time path so the shop is interactive.
    await grantCosmetic(req.session!.userId, cosmeticId, 'purchase');
    res.json({ ok: true, cosmeticId });
});
