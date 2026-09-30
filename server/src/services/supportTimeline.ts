import type { Document } from 'mongodb';
import { col, registerIndexes } from '../db/mongo.js';

registerIndexes('inventory_history', [{ key: { user_id: 1, created_at: -1 } }]);

type Event = { kind: string; ref: string; at: Date; detail: Record<string, unknown> };

export async function playerTimeline(id: string, search = '', before = new Date().toISOString()) {
    const cutoff = new Date(before);
    // ponytail: with no search each source is capped at 100 (top-100 of the
    // union only needs each source's top 100); with a search we scan all of a
    // player's rows and filter in JS. Per-player volumes are small.
    const cap = search ? 0 : 100;
    const pull = async (
        name: string, filter: Document, atField: string,
        map: (d: Document) => Omit<Event, 'at'>
    ): Promise<Event[]> => {
        const docs = await col(name).find({ ...filter, [atField]: { $lt: cutoff } }).sort({ [atField]: -1 }).limit(cap).toArray();
        return docs.map((d) => ({ ...map(d), at: d[atField] as Date }));
    };
    const lists = await Promise.all([
        pull('matches', { $or: [{ player1_id: id }, { player2_id: id }] }, 'ended_at', (m) =>
            ({ kind: 'match', ref: String(m.id), detail: { outcome: m.outcome, winnerId: m.winner_id ?? null, word: m.word } })),
        pull('iap_transactions', { user_id: id }, 'created_at', (t) =>
            ({ kind: 'purchase', ref: String(t.id), detail: { product: t.product_id, platform: t.platform, verified: t.store_verified } })),
        pull('coin_grants', { user_id: id }, 'created_at', (g) =>
            ({ kind: 'coins', ref: String(g.id), detail: { amount: g.amount, source: g.source } })),
        pull('user_cosmetics', { user_id: id }, 'acquired_at', (c) =>
            ({ kind: 'cosmetic', ref: String(c.cosmetic_id), detail: { item: c.cosmetic_id, via: c.acquired_via } })),
        pull('inventory_history', { user_id: id }, 'created_at', (h) =>
            ({ kind: 'inventory', ref: String(h.id), detail: { before: h.before_state, after: h.after_state } })),
        pull('admin_audit_log', { target_type: 'user', target_id: id }, 'created_at', (a) =>
            ({ kind: 'moderation', ref: String(a.id), detail: { action: a.action, admin: a.admin_name, detail: a.detail } })),
    ]);
    const needle = search.toLowerCase();
    return lists
        .flat()
        .filter((e) => !needle || e.kind.toLowerCase().includes(needle) || JSON.stringify(e.detail).toLowerCase().includes(needle))
        .sort((a, b) => b.at.getTime() - a.at.getTime() || (b.ref > a.ref ? 1 : b.ref < a.ref ? -1 : 0))
        .slice(0, 100);
}
