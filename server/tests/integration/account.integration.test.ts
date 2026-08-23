// DB-backed integration test for account deletion. Self-skips when no
// DATABASE_URL is configured (i.e. normal local `npm test`), and runs in CI
// where a Postgres service + env are provided. Uses dynamic imports so the
// env loader (which hard-exits on missing config) isn't triggered when skipped.

import { describe, it, expect, afterAll } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('deleteAccount (integration)', () => {
    let pool: typeof import('../../src/db/pool.js').pool;
    let createUser: typeof import('../../src/services/userService.js').createUser;
    let deleteAccount: typeof import('../../src/services/userService.js').deleteAccount;
    let findUserById: typeof import('../../src/services/userService.js').findUserById;

    afterAll(async () => {
        if (pool) await pool.end();
    });

    it('removes the user and their matches, keeping integrity', async () => {
        const userSvc = await import('../../src/services/userService.js');
        ({ createUser, deleteAccount, findUserById } = userSvc);
        ({ pool } = await import('../../src/db/pool.js'));

        const subject = `itest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const user = await createUser({
            username: `it_${Date.now().toString(36).slice(-8)}`,
            provider: 'anonymous',
            subject,
        });
        expect(await findUserById(user.id)).not.toBeNull();

        await deleteAccount(user.id);
        expect(await findUserById(user.id)).toBeNull();

        // Child rows (default cosmetics granted at creation) are gone too.
        const cos = await pool.query(
            'SELECT 1 FROM user_cosmetics WHERE user_id = $1',
            [user.id]
        );
        expect(cos.rowCount).toBe(0);
    });
});
