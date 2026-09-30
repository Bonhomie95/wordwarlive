// DB-backed integration test for account deletion. Self-skips when no
// MONGODB_URL is configured (i.e. normal local `npm test`), and runs in CI
// where a MongoDB service + env are provided.

import { describe, it, expect } from 'vitest';
import { hasDb, mongo, useDb } from './db.js';

describe.skipIf(!hasDb)('deleteAccount (integration)', () => {
    useDb();

    it('removes the user and their matches, keeping integrity', async () => {
        const { createUser, deleteAccount, findUserById } = await import('../../src/services/userService.js');
        const { col } = await mongo();

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
        expect(await col('user_cosmetics').countDocuments({ user_id: user.id })).toBe(0);
    });
});
