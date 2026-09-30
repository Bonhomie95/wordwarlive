import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ aggregate: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock('../src/db/mongo.js', () => ({
    col: () => ({ aggregate: (pipeline: unknown) => ({ toArray: () => mocks.aggregate(pipeline) }) }),
    registerIndexes: () => {},
}));
vi.mock('../src/db/redis.js', () => ({ redis: { get: mocks.get, set: mocks.set } }));
vi.mock('../src/services/syntheticHistory.js', async () => {
    const players = await import('../src/services/syntheticPlayers.js');
    const daily = await import('../src/services/dailySynthetic.js');
    return { persistedSyntheticLeaderboard: async (period: Parameters<typeof players.syntheticLeaderboard>[0], mode: Parameters<typeof players.syntheticLeaderboard>[1]) => players.syntheticLeaderboard(period, mode), persistedDailySolvers: async (day: string) => daily.visibleSyntheticSolvers(day) };
});
import { getLeaderboard } from '../src/services/leaderboardService.js';
import { todaysLeaderboard } from '../src/services/dailyChallengeService.js';
import { syntheticLeaderboard, compareStandings } from '../src/services/syntheticPlayers.js';
import { visibleSyntheticSolvers } from '../src/services/dailySynthetic.js';
const NOW = Date.parse('2026-09-27T15:10:00Z');

describe('combined leaderboard integrity', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        vi.resetAllMocks();
        mocks.get.mockResolvedValue(null);
        mocks.set.mockResolvedValue('OK');
        mocks.aggregate.mockResolvedValue([]);
    });
    afterEach(() => vi.useRealTimers());
    it('fills all twelve ranked period/mode boards', async () => {
        for (const period of ['daily', 'weekly', 'monthly', 'all_time'] as const) {
            for (const mode of ['classic', 'mystery', 'overall'] as const) {
                const board = await getLeaderboard({ period, mode });
                expect(board.entries).toHaveLength(Math.min(50, syntheticLeaderboard(period, mode, NOW).length));
                expect(board.entries.length).toBeGreaterThan(0);
                expect(board.entries.every((entry, i) => entry.rankInLeaderboard === i + 1)).toBe(true);
                expect(new Set(board.entries.map((entry) => entry.userId)).size).toBe(board.entries.length);
            }
        }
    });
    it('uses the same tiebreak for visible rows and the requesting player', async () => {
        const sample = syntheticLeaderboard('daily', 'overall', NOW)[4]!;
        const raw = { user_id: '11111111-1111-4111-8111-111111111111', username: 'player', rank_tier: sample.rankTier,
            wins: sample.wins, losses: 1, rank_points: sample.rankPoints, equipped_avatar: null, equipped_profile_border: null };
        // top-N rows, then the requester's own row, then the "humans ahead" count (none).
        mocks.aggregate.mockResolvedValueOnce([raw]).mockResolvedValueOnce([raw]).mockResolvedValueOnce([]);
        const board = await getLeaderboard({ period: 'daily', requesterId: raw.user_id });
        const expected = 1 + syntheticLeaderboard('daily', 'overall', NOW).filter((s) => compareStandings(s, { userId: raw.user_id, wins: raw.wins, rankPoints: raw.rank_points }) < 0).length;
        expect(board.you?.rankInLeaderboard).toBe(expected);
        expect(board.entries.find((entry) => entry.userId === raw.user_id)?.rankInLeaderboard).toBe(expected);
    });
    it('combines daily solvers and keeps a one-guess human solution first', async () => {
        mocks.aggregate.mockResolvedValue([{ user_id: 'one', username: 'player', guess_count: 1, duration_ms: 10000 }]);
        const board = await todaysLeaderboard(50, 'one');
        expect(board.total).toBe(visibleSyntheticSolvers('2026-09-27', NOW).length + 1);
        expect(board.me?.rank).toBe(1);
        expect(board.entries[0]?.userId).toBe('one');
    });
});
