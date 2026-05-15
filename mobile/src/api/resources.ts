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
    /** Fetch the top-N for a given period+mode plus the requesting user's rank. */
    fetch: (
        period: LeaderboardPeriod,
        mode: 'classic' | 'mystery' | 'overall' = 'overall',
        limit = 50
    ) =>
        apiRequest<LeaderboardResponse>(
            `/api/leaderboard?period=${period}&mode=${mode}&limit=${limit}`
        ),
};

export interface UserSettings {
    sound: boolean;
    haptics: boolean;
    colorBlindMode: boolean;
}

export const settingsApi = {
    get: () => apiRequest<UserSettings>('/api/settings'),
    update: (patch: Partial<UserSettings>) =>
        apiRequest<UserSettings>('/api/settings', {
            method: 'PATCH',
            body: patch,
        }),
};

export interface DailyChallengeMeta {
    challengeDate: string;
    wordLength: number;
}
export interface DailyAttempt {
    guesses: { guess: string; tiles: ('correct' | 'misplaced' | 'wrong')[] }[];
    solved: boolean;
    guessCount: number;
    durationMs: number;
    startedAt: number;
}

export const dailyApi = {
    today: () =>
        apiRequest<{ challenge: DailyChallengeMeta; attempt: DailyAttempt | null }>(
            '/api/daily'
        ),
    guess: (guess: string) =>
        apiRequest<{
            ok: boolean;
            tiles: ('correct' | 'misplaced' | 'wrong')[];
            solved: boolean;
            guessCount: number;
            error?: string;
            errorCode?: string;
        }>('/api/daily/guess', { method: 'POST', body: { guess } }),
    leaderboard: () =>
        apiRequest<{
            entries: {
                userId: string;
                username: string;
                guessCount: number;
                durationMs: number;
            }[];
        }>('/api/daily/board'),
};

export interface RankSeason {
    id: number;
    name: string;
    startsAt: string;
    endsAt: string;
    softResetDelta: number;
}
export interface SeasonResetResult {
    seasonId: number;
    peakPoints: number;
    finalPoints: number;
    finalTier: string;
}

export const seasonsApi = {
    current: () =>
        apiRequest<{
            season: RankSeason | null;
            reset: {
                resetApplied: boolean;
                previousSeasonResult?: SeasonResetResult;
            };
        }>('/api/seasons/current'),
};

export interface MysterySubmission {
    id: string;
    word: string;
    wordLength: number;
    available: boolean;
    createdAt: string;
}

export const mysteryApi = {
    submit: (word: string) =>
        apiRequest<{ ok: boolean; submission?: MysterySubmission; error?: string }>(
            '/api/mystery/submit',
            { method: 'POST', body: { word } }
        ),
    pending: () =>
        apiRequest<{ submission: MysterySubmission | null }>(
            '/api/mystery/pending'
        ),
    withdraw: () =>
        apiRequest<{ ok: boolean }>('/api/mystery/withdraw', {
            method: 'POST',
            body: {},
        }),
};

export interface FriendInfo {
    userId: string;
    username: string;
    rankPoints: number;
    rankTier: string;
    isOnline: boolean;
}

export const friendsApi = {
    list: () => apiRequest<{ friends: FriendInfo[] }>('/api/friends'),
    createCode: () =>
        apiRequest<{ code: string }>('/api/friends/code', {
            method: 'POST',
            body: {},
        }),
    redeem: (code: string) =>
        apiRequest<{
            ok: boolean;
            friendUserId?: string;
            friendUsername?: string;
            error?: string;
        }>('/api/friends/redeem', { method: 'POST', body: { code } }),
    remove: (friendId: string) =>
        apiRequest<{ ok: boolean }>(`/api/friends/${friendId}`, {
            method: 'DELETE',
        }),
    createPrivateMatch: (wordLength: number | null) =>
        apiRequest<{ code: string }>('/api/private-match/code', {
            method: 'POST',
            body: { wordLength },
        }),
};

export interface ReplayMeta {
    matchId: string;
    mode: string;
    word: string;
    wordLength: number;
    opponentUsername: string;
    youWon: boolean;
    outcome: string;
    durationMs: number;
    createdAt: string;
}

export const replaysApi = {
    list: () => apiRequest<{ replays: ReplayMeta[] }>('/api/replays'),
    get: (matchId: string) =>
        apiRequest<
            ReplayMeta & {
                yourGuesses: { guess: string; tiles: string[] }[];
                opponentGuesses: { guess: string; tiles: string[] }[];
            }
        >(`/api/replays/${matchId}`),
};
