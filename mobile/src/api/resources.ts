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
    deleteAccount: () =>
        apiRequest<{ ok: boolean }>('/api/me', { method: 'DELETE' }),
    changeUsername: (username: string) =>
        apiRequest<MeResponse>('/api/me/username', {
            method: 'PATCH',
            body: { username },
        }),
};

export const boostsApi = {
    buyStreakShield: () =>
        apiRequest<{ ok: boolean; shields: number; coins: number }>('/api/boosts/streak-shield', {
            method: 'POST',
            body: {},
        }),
    buyXpBoost: () =>
        apiRequest<{ ok: boolean; xpBoostUntil: string; coins: number }>('/api/boosts/xp', {
            method: 'POST',
            body: {},
        }),
};

export const matchesApi = {
    recent: (limit = 25) =>
        apiRequest<{ matches: RecentMatch[] }>(`/api/matches/recent?limit=${limit}`),
};

/** Store receipt payload forwarded to the server for IAP verification. Empty
 *  in dev / Expo Go (no native store), where the server grants directly when
 *  IAP_ENFORCE is off. */
export interface IapPayload {
    platform?: 'ios' | 'android';
    receipt?: string;
    transactionId?: string;
}

export const cosmeticsApi = {
    list: () => apiRequest<{ cosmetics: Cosmetic[] }>('/api/cosmetics'),
    owned: () => apiRequest<{ owned: string[] }>('/api/me/cosmetics'),
    purchase: (id: string, payload: IapPayload = {}) =>
        apiRequest<{ ok: boolean; cosmeticId: string }>(
            `/api/cosmetics/${id}/purchase`,
            { method: 'POST', body: payload }
        ),
    purchaseWithCoins: (id: string) =>
        apiRequest<{ ok: boolean; cosmeticId: string; coins: number }>(
            `/api/cosmetics/${id}/purchase-coins`,
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
    upgradePremium: (payload: IapPayload = {}) =>
        apiRequest<{ ok: boolean }>('/api/battlepass/upgrade-premium', {
            method: 'POST',
            body: payload,
        }),
};

export const adsApi = {
    /** Mark the user as ads-free after a successful Remove Ads IAP. */
    removeAdsPurchase: (payload: IapPayload = {}) =>
        apiRequest<{ ok: boolean }>('/api/ads/remove-ads-purchase', {
            method: 'POST',
            body: payload,
        }),
    /**
     * Dev-only: directly claim a rewarded-ad reward without going through
     * AdMob's SSV (which can't reach localhost). Server gates this on
     * NODE_ENV !== 'production'.
     */
    devClaimReward: (rewardKind: 'daily_bonus' | 'bp_xp_boost' | 'coin_boost') =>
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
    purchase: (packId: string, payload: IapPayload = {}) =>
        apiRequest<{
            ok: boolean;
            pack: { id: string; name: string; coins: number };
            newBalance: number;
        }>(`/api/coins/packs/${packId}/purchase`, {
            method: 'POST',
            body: payload,
        }),
    purchaseStarterBundle: (payload: IapPayload = {}) =>
        apiRequest<{ ok: boolean; newBalance: number }>('/api/coins/bundles/starter/purchase', {
            method: 'POST',
            body: payload,
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
    /** Coins granted for solving (0 until solved). */
    coinsAwarded: number;
}
/** Server-tracked hint state for today's challenge. Cap is word-length
 *  aware: 1 hint for 4–7 letter words, 2 for 8+ (very long words). */
export interface DailyHintState {
    hintsUsed: number;
    hintCap: number;
    hints: { position: number; letter: string }[];
}

export const dailyApi = {
    today: () =>
        apiRequest<{
            challenge: DailyChallengeMeta;
            attempt: DailyAttempt | null;
            hints: DailyHintState;
        }>('/api/daily'),
    hint: () =>
        apiRequest<{
            ok: true;
            position: number;
            letter: string;
            paidWith: 'free' | 'credit' | 'coins';
            coinsSpent: number;
            coinsRemaining: number;
            hintCreditsRemaining: number;
            lifetimeHintsUsed: number;
        }>('/api/daily/hint', { method: 'POST', body: {} }),
    guess: (guess: string) =>
        apiRequest<{
            ok: boolean;
            tiles: ('correct' | 'misplaced' | 'wrong')[];
            solved: boolean;
            guessCount: number;
            coinsAwarded?: number;
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

export type ReportTargetType = 'user' | 'mystery_word' | 'match';
export type ReportReason =
    | 'offensive_name'
    | 'offensive_word'
    | 'cheating'
    | 'harassment'
    | 'other';

export const reportsApi = {
    submit: (args: {
        targetType: ReportTargetType;
        targetId?: string;
        reason: ReportReason;
        detail?: string;
    }) =>
        apiRequest<{ ok: boolean }>('/api/reports', {
            method: 'POST',
            body: args,
        }),
};

export interface BlockedUser {
    userId: string;
    username: string;
    rankPoints: number;
    rankTier: string;
    createdAt: string;
}

export const blocksApi = {
    list: () => apiRequest<{ blocked: BlockedUser[] }>('/api/blocks'),
    block: (targetId: string) =>
        apiRequest<{ ok: boolean }>('/api/blocks', {
            method: 'POST',
            body: { targetId },
        }),
    unblock: (targetId: string) =>
        apiRequest<{ ok: boolean }>(`/api/blocks/${targetId}`, {
            method: 'DELETE',
        }),
};

export const pushApi = {
    register: (token: string, platform?: 'ios' | 'android') =>
        apiRequest<{ ok: boolean }>('/api/push/register', {
            method: 'POST',
            body: { token, platform },
        }),
    unregister: (token: string) =>
        apiRequest<{ ok: boolean }>('/api/push/unregister', {
            method: 'POST',
            body: { token },
        }),
};

export const authAccountApi = {
    /** Invalidate every session (all devices) and return a fresh token for
     *  this device. */
    logoutEverywhere: () =>
        apiRequest<{ token: string; user: PublicUser }>('/api/auth/logout-all', {
            method: 'POST',
            body: {},
        }),
};
