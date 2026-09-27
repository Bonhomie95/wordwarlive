import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ query: mocks.query, pool: {} }));
vi.mock('../src/db/redis.js', () => ({ redis: { get: mocks.get, set: mocks.set } }));
import { getLeaderboard } from '../src/services/leaderboardService.js';
import { todaysLeaderboard } from '../src/services/dailyChallengeService.js';

describe('public leaderboard integrity', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.get.mockResolvedValue(null);
        mocks.set.mockResolvedValue('OK');
        mocks.query.mockResolvedValue([]);
    });
    it('does not invent ranked players when there are no results', async () => {
        expect((await getLeaderboard({ period: 'daily' })).entries).toEqual([]);
    });
    it('does not invent daily solvers or inflate a real player rank', async () => {
        expect(await todaysLeaderboard()).toEqual({ entries: [], me: null, total: 0 });
        mocks.query.mockResolvedValue([{ user_id: 'one', username: 'player', guess_count: 4, duration_ms: 80000 }]);
        const board = await todaysLeaderboard(50, 'one');
        expect(board.total).toBe(1);
        expect(board.me?.rank).toBe(1);
        expect(board.entries.map((row) => row.userId)).toEqual(['one']);
    });
});
