import { apiRequest } from './client';
import type {
    BattlePassResponse,
    CoinPacksResponse,
    Cosmetic,
    LeaderboardPeriod,
    LeaderboardResponse,
    MeResponse,
    PublicUser,
    RecentMatch,
    StreakResponse,
} from '../types/index';

export const usersApi = {
    me: () => apiRequest<MeResponse>('/api/me'),
    publicProfile: (id: string) =>
        apiRequest<PublicUser>(`/api/users/${id}`, { auth: false }),
    equip: (category: string, cosmeticId: string) =>
        apiRequest<MeResponse>('/api/me/equip', {
            method: 'PATCH',
            body: { category, cosmeticId },
        }),
};

export const matchesApi = {
    recent: (limit = 25) =>
        apiRequest<{ matches: RecentMatch[] }>(`/api/matches/recent?limit=${limit}`),
};

export const cosmeticsApi = {
    list: () => apiRequest<{ cosmetics: Cosmetic[] }>('/api/cosmetics'),
    owned: () => apiRequest<{ owned: string[] }>('/api/me/cosmetics'),
    purchase: (id: string) =>
        apiRequest<{ ok: boolean; cosmeticId: string }>(
            `/api/cosmetics/${id}/purchase`,
            { method: 'POST', body: {} }
        ),
};

export const battlePassApi = {
    current: () => apiRequest<BattlePassResponse>('/api/battlepass/current'),
    claim: (tier: number, track: 'free' | 'premium') =>
        apiRequest<{ ok: boolean; cosmeticId: string | null }>(
            '/api/battlepass/claim',
            { method: 'POST', body: { tier, track } }
        ),
    upgradePremium: () =>
        apiRequest<{ ok: boolean }>('/api/battlepass/upgrade-premium', {
            method: 'POST',
            body: {},
        }),
};

export const adsApi = {
    /** Mark the user as ads-free after a successful Remove Ads IAP. */
    removeAdsPurchase: () =>
        apiRequest<{ ok: boolean }>('/api/ads/remove-ads-purchase', {
            method: 'POST',
            body: {},
        }),
    /**
     * Dev-only: directly claim a rewarded-ad reward without going through
     * AdMob's SSV (which can't reach localhost). Server gates this on
     * NODE_ENV !== 'production'.
     */
    devClaimReward: (rewardKind: 'daily_bonus' | 'bp_xp_boost') =>
        apiRequest<{ ok: boolean; rewardKind: string }>(
            '/api/ads/dev-claim-reward',
            {
                method: 'POST',
                body: {
                    rewardKind,
                    // getTimezoneOffset is positive for west-of-UTC; we
                    // negate so the server gets minutes east-of-UTC.
                    tzOffsetMinutes: -new Date().getTimezoneOffset(),
                },
            }
        ),
};

export const coinsApi = {
    listPacks: () => apiRequest<CoinPacksResponse>('/api/coins/packs'),
    purchase: (packId: string) =>
        apiRequest<{
            ok: boolean;
            pack: { id: string; name: string; coins: number };
            newBalance: number;
        }>(`/api/coins/packs/${packId}/purchase`, {
            method: 'POST',
            body: {},
        }),
};

export const streakApi = {
    state: () => apiRequest<StreakResponse>('/api/streak'),
};

export const leaderboardApi = {
    /** Fetch the top-N for a given period plus the requesting user's rank. */
    fetch: (period: LeaderboardPeriod, limit = 50) =>
        apiRequest<LeaderboardResponse>(
            `/api/leaderboard?period=${period}&limit=${limit}`
        ),
};
