// DB-backed check of the purchase-replay semantics in iap/verify.ts:
//   • first sight of a transaction → ok, grant
//   • SAME user re-sends it       → ok, alreadyGranted (nothing re-granted)
//   • DIFFERENT user sends it     → 409
// Self-skips without DATABASE_URL (runs in CI and against the local dev DB).

import { describe, it, expect, afterAll } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('verifyIapPurchase replay semantics (integration)', () => {
    let pool: typeof import('../../src/db/pool.js').pool;
    const created: string[] = [];

    afterAll(async () => {
        if (pool) {
            for (const id of created) await pool.query('DELETE FROM users WHERE id = $1', [id]);
            await pool.end();
        }
    });

    it('is idempotent per user and refuses cross-account replays', async () => {
        const { createUser } = await import('../../src/services/userService.js');
        const { verifyIapPurchase } = await import('../../src/iap/verify.js');
        ({ pool } = await import('../../src/db/pool.js'));

        const mk = async (tag: string) => {
            const u = await createUser({
                username: `iap_${tag}_${Date.now().toString(36).slice(-6)}`,
                provider: 'anonymous',
                subject: `iap-test-${tag}-${Date.now()}-${Math.random()}`,
            });
            created.push(u.id);
            return u.id;
        };
        const a = await mk('a');
        const b = await mk('b');
        const txn = `itest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const base = {
            productId: 'dev.bonhomieinc.wordwar.remove_ads',
            entitlement: 'remove_ads',
            platform: 'ios',
            transactionId: txn,
        };

        const first = await verifyIapPurchase({ ...base, userId: a });
        expect(first.ok && !first.alreadyGranted).toBe(true);

        const replay = await verifyIapPurchase({ ...base, userId: a });
        expect(replay.ok && replay.alreadyGranted).toBe(true);

        const other = await verifyIapPurchase({ ...base, userId: b });
        expect(other.ok).toBe(false);
        if (!other.ok) expect(other.status).toBe(409);
    });
});
