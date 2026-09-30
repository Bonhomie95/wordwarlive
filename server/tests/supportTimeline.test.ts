import { describe, it, expect, vi } from 'vitest';

// In-memory stand-in for col(): each collection is a plain array; find() honours
// the `{ field: { $lt } }` cutoff, sort direction and limit(0 = unlimited).
const data: Record<string, Record<string, unknown>[]> = {
    matches: [
        { id: 'm1', player1_id: 'u1', player2_id: 'u2', outcome: 'win', winner_id: 'u1', word: 'apple', ended_at: new Date('2026-01-03') },
        { id: 'm2', player1_id: 'u3', player2_id: 'u1', outcome: 'loss', winner_id: 'u3', word: 'grape', ended_at: new Date('2026-01-01') },
        { id: 'm9', player1_id: 'u3', player2_id: 'u1', outcome: 'loss', winner_id: 'u3', word: 'later', ended_at: new Date('2026-02-01') },
    ],
    iap_transactions: [{ id: 't1', user_id: 'u1', product_id: 'coins.big', platform: 'ios', store_verified: true, created_at: new Date('2026-01-02') }],
    coin_grants: [{ id: 'c1', user_id: 'u1', amount: 50, source: 'admin_grant', created_at: new Date('2026-01-03') }],
    user_cosmetics: [],
    inventory_history: [],
    admin_audit_log: [{ id: 'a1', target_type: 'user', target_id: 'u1', action: 'ban', admin_name: 'root', detail: {}, created_at: new Date('2026-01-04') }],
};

vi.mock('../src/db/mongo.js', () => ({
    registerIndexes: () => {},
    col: (name: string) => ({
        find(filter: Record<string, unknown>) {
            let rows = data[name].filter((d) => {
                for (const [k, v] of Object.entries(filter)) {
                    if (k === '$or') { if (!(v as Record<string, unknown>[]).some((f) => Object.entries(f).every(([fk, fv]) => d[fk] === fv))) return false; }
                    else if (v && typeof v === 'object' && '$lt' in (v as object)) { if (!((d[k] as Date) < (v as { $lt: Date }).$lt)) return false; }
                    else if (d[k] !== v) return false;
                }
                return true;
            });
            let lim = 0;
            const cursor = {
                sort(s: Record<string, 1 | -1>) { const [[k, dir]] = Object.entries(s); rows = [...rows].sort((a, b) => ((a[k] as Date) < (b[k] as Date) ? -dir : dir)); return cursor; },
                limit(n: number) { lim = n; return cursor; },
                async toArray() { return lim ? rows.slice(0, lim) : rows; },
            };
            return cursor;
        },
    }),
}));

const { playerTimeline } = await import('../src/services/supportTimeline.js');

describe('playerTimeline', () => {
    it('merges sources newest-first, honours the cutoff and the ref tiebreak', async () => {
        const rows = await playerTimeline('u1', '', '2026-01-10T00:00:00.000Z');
        expect(rows.map((r) => `${r.kind}:${r.ref}`)).toEqual(['moderation:a1', 'match:m1', 'coins:c1', 'purchase:t1', 'match:m2']);
        expect(rows[1].detail).toEqual({ outcome: 'win', winnerId: 'u1', word: 'apple' });
    });
    it('filters case-insensitively on kind or detail text', async () => {
        expect((await playerTimeline('u1', 'GRAPE', '2026-01-10T00:00:00.000Z')).map((r) => r.ref)).toEqual(['m2']);
        expect((await playerTimeline('u1', 'ADMIN_grant', '2026-01-10T00:00:00.000Z')).map((r) => r.ref)).toEqual(['c1']);
    });
});
