import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    findOne: vi.fn(), deleteMany: vi.fn(), deleteOne: vi.fn(), find: vi.fn(), revoke: vi.fn(), publish: vi.fn(),
}));
vi.mock('../src/db/mongo.js', () => ({
    col: () => ({
        findOne: mocks.findOne,
        deleteMany: mocks.deleteMany,
        deleteOne: mocks.deleteOne,
        find: mocks.find,
    }),
    newId: () => 'id',
    registerIndexes: () => {},
}));
vi.mock('../src/db/redis.js', () => ({ redis: { publish: mocks.publish } }));
vi.mock('../src/auth/apple.js', () => ({ revokeAppleRefreshToken: mocks.revoke }));
import { deleteAccount, AppleRevocationPendingError } from '../src/services/userService.js';

describe('Apple account deletion', () => {
    beforeEach(() => vi.resetAllMocks());
    it('retains the account and refresh token when Apple revocation fails', async () => {
        mocks.findOne.mockResolvedValue({ apple_refresh_token: 'test-token' });
        mocks.revoke.mockResolvedValue(false);
        await expect(deleteAccount('user')).rejects.toBeInstanceOf(AppleRevocationPendingError);
        expect(mocks.deleteOne).not.toHaveBeenCalled();
        expect(mocks.deleteMany).not.toHaveBeenCalled();
        expect(mocks.publish).not.toHaveBeenCalled();
    });
    it('deletes after revocation and broadcasts session invalidation', async () => {
        mocks.findOne.mockResolvedValue({ apple_refresh_token: 'test-token' });
        mocks.revoke.mockResolvedValue(true);
        mocks.find.mockReturnValue({ toArray: async () => [{ id: 'm1' }] });
        mocks.deleteMany.mockResolvedValue({ deletedCount: 1 });
        mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
        mocks.publish.mockResolvedValue(1);
        await deleteAccount('user');
        expect(mocks.revoke).toHaveBeenCalledWith('test-token');
        expect(mocks.deleteMany).toHaveBeenCalledWith({ match_id: { $in: ['m1'] } });
        expect(mocks.deleteMany).toHaveBeenCalledWith({ $or: [{ user_id: 'user' }, { friend_id: 'user' }] });
        expect(mocks.deleteOne).toHaveBeenCalledWith({ id: 'user' });
        expect(mocks.publish).toHaveBeenCalledWith('wordwar:session-revoked', 'user');
    });
});
