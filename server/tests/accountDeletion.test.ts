import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), revoke: vi.fn(), publish: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ query: mocks.query, connectTransactionClient: mocks.connect, pool: { connect: mocks.connect } }));
vi.mock('../src/db/redis.js', () => ({ redis: { publish: mocks.publish } }));
vi.mock('../src/auth/apple.js', () => ({ revokeAppleRefreshToken: mocks.revoke }));
import { deleteAccount, AppleRevocationPendingError } from '../src/services/userService.js';

describe('Apple account deletion', () => {
    beforeEach(() => vi.resetAllMocks());
    it('retains the account and refresh token when Apple revocation fails', async () => {
        mocks.query.mockResolvedValue([{ apple_refresh_token: 'test-token' }]);
        mocks.revoke.mockResolvedValue(false);
        await expect(deleteAccount('user')).rejects.toBeInstanceOf(AppleRevocationPendingError);
        expect(mocks.connect).not.toHaveBeenCalled();
        expect(mocks.publish).not.toHaveBeenCalled();
    });
    it('deletes after revocation and broadcasts session invalidation', async () => {
        mocks.query.mockResolvedValue([{ apple_refresh_token: 'test-token' }]);
        mocks.revoke.mockResolvedValue(true);
        const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
        mocks.connect.mockResolvedValue(client);
        mocks.publish.mockResolvedValue(1);
        await deleteAccount('user');
        expect(mocks.revoke).toHaveBeenCalledWith('test-token');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(mocks.publish).toHaveBeenCalledWith('wordwar:session-revoked', 'user');
        expect(client.release).toHaveBeenCalledOnce();
    });
});
