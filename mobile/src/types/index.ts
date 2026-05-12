// MIRROR OF server/src/types/index.ts. When the wire protocol changes,
// update both files.

export type Tile = 'correct' | 'misplaced' | 'wrong';

export type AuthProvider = 'anonymous' | 'email' | 'google' | 'apple';

export type RankTier =
    | 'stone'
    | 'bronze'
    | 'silver'
    | 'gold'
    | 'platinum'
    | 'diamond'
    | 'master'
    | 'legend';

export type CosmeticCategory =
    | 'board_theme'
    | 'victory_anim'
    | 'avatar'
    | 'nameplate'
    | 'profile_border';

export type PowerUp = 'reveal' | 'scramble' | 'lock';

export interface PublicUser {
    id: string;
    username: string;
    provider: AuthProvider;
    rankPoints: number;
    rankTier: RankTier;
    wins: number;
    losses: number;
    isBot?: boolean;
    equipped?: {
        boardTheme: string | null;
        victoryAnim: string | null;
        avatar: string | null;
        nameplate: string | null;
        profileBorder: string | null;
    };
}

export interface AuthResponse {
    token: string;
    user: PublicUser;
}

export interface MeResponse {
    id: string;
    username: string;
    provider: AuthProvider;
    rankPoints: number;
    rankTier: RankTier;
    wins: number;
    losses: number;
    winStreak: number;
    bestStreak: number;
    equipped: {
        boardTheme: string | null;
        victoryAnim: string | null;
        avatar: string | null;
        nameplate: string | null;
        profileBorder: string | null;
    };
    battlePass: {
        xp: number;
        premium: boolean;
        season: number;
    };
    ads: {
        removed: boolean;
        /** ISO timestamp of the last daily-bonus claim, or null. */
        lastDailyAdAt: string | null;
        /** XP-boost ads watched today (resets at UTC midnight). */
        xpBoostAdsToday: number;
        xpBoostDailyLimit: number;
    };
    powerups: {
        reveal: number;
        scramble: number;
        lock: number;
    };
    coins: number;
    hintCredits: number;
    /** How many hints the user has ever taken across all matches.
     *  When 0, the next hint is free. */
    lifetimeHintsUsed: number;
    streak: {
        playStreak: number;
        playStreakBest: number;
        /** YYYY-MM-DD UTC, or null if no completed match yet. */
        lastPlayDate: string | null;
    };
}

export interface CoinPack {
    id: string;
    name: string;
    description: string;
    coins: number;
    priceUsd: number;
    productId: string;
    featured?: boolean;
    bonusPct?: number;
}

export interface CoinPacksResponse {
    packs: CoinPack[];
    hintCost: number;
}

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

export interface LeaderboardEntry {
    userId: string;
    username: string;
    rankTier: RankTier;
    wins: number;
    losses: number;
    rankPoints: number;
    rankInLeaderboard: number;
    avatarId: string | null;
    profileBorderId: string | null;
}

export interface LeaderboardResponse {
    period: LeaderboardPeriod;
    bucket: string;
    entries: LeaderboardEntry[];
    you: LeaderboardEntry | null;
}

export interface StreakResponse {
    playStreak: number;
    playStreakBest: number;
    lastPlayDate: string | null;
    milestones: { day: number; coins: number; hintCredits: number }[];
    nextMilestone: { day: number; coins: number; hintCredits: number } | null;
}

export interface Cosmetic {
    id: string;
    category: CosmeticCategory;
    name: string;
    description: string | null;
    priceCents: number;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    renderData: Record<string, unknown>;
    availableInShop: boolean;
    owned: boolean;
}

export interface BattlePassRewardView {
    tier: number;
    track: 'free' | 'premium';
    cosmeticId: string | null;
    unlocked: boolean;
    claimed: boolean;
}

export interface BattlePassResponse {
    active: boolean;
    season?: {
        seasonNumber: number;
        name: string;
        startsAt: string;
        endsAt: string;
        xpPerTier: number;
        maxTier: number;
    };
    you?: {
        xp: number;
        currentTier: number;
        premium: boolean;
    };
    rewards?: BattlePassRewardView[];
}

export interface RecentMatch {
    id: string;
    word: string;
    outcome: string;
    isWin: boolean;
    rankDelta: number;
    opponentUsername: string;
    opponentIsBot: boolean;
    durationSeconds: number;
    endedAt: string;
}

// ─── Socket protocol ────────────────────────────────────────────────────────

export interface ClientToServerEvents {
    queue_join: () => void;
    queue_leave: () => void;
    guess_submit: (
        payload: { guess: string },
        ack: (resp: GuessAck) => void
    ) => void;
    powerup_use: (
        payload: { kind: PowerUp; targetGuessIndex?: number },
        ack: (resp: { ok: boolean; error?: string }) => void
    ) => void;
    hint_request: (
        payload: Record<string, never>,
        ack: (resp: HintAck) => void
    ) => void;
    match_resume: (
        payload: Record<string, never>,
        ack: (resp: { ok: boolean; reason?: string }) => void
    ) => void;
    match_quit: (
        payload: Record<string, never>,
        ack: (resp: { ok: boolean; reason?: string }) => void
    ) => void;
}

export interface ServerToClientEvents {
    queue_status: (payload: QueueStatus) => void;
    match_found: (payload: MatchFound) => void;
    match_start: (payload: MatchStart) => void;
    guess_result: (payload: GuessBroadcast) => void;
    opponent_scramble: () => void;
    match_tick: (payload: { msRemaining: number }) => void;
    match_over: (payload: MatchOver) => void;
    error: (payload: { message: string; code?: string }) => void;
}

export interface QueueStatus {
    state: 'searching' | 'expanded_search' | 'matching_with_bot';
    waitedMs: number;
}

export interface MatchFound {
    matchId: string;
    wordLength: number;
    durationSeconds: number;
    you: PublicUser;
    opponent: PublicUser;
    slot: 1 | 2;
}

export interface MatchStart {
    matchId: string;
    startedAt: number;
}

export interface GuessAck {
    ok: boolean;
    error?: string;
    errorCode?:
        | 'WRONG_LENGTH'
        | 'NOT_IN_WORD_BANK'
        | 'NON_ALPHABETIC'
        | 'RATE_LIMITED'
        | 'GAME_NOT_ACTIVE';
}

export interface GuessBroadcast {
    matchId: string;
    side: 'me' | 'opponent';
    guessIndex: number;
    guess: string | null;
    tiles: Tile[];
    solved: boolean;
}

export interface MatchOver {
    matchId: string;
    result: 'win' | 'loss' | 'tie';
    outcome:
        | 'p1_solved'
        | 'p2_solved'
        | 'p1_more_correct'
        | 'p2_more_correct'
        | 'tie'
        | 'forfeit';
    word: string;
    rankDelta: number;
    newRankPoints: number;
    newRankTier: RankTier;
    battlePassXpAwarded: number;
    yourGuesses: Array<{ guess: string; tiles: Tile[] }>;
    opponentGuesses: Array<{ guess: string; tiles: Tile[] }>;
    wordTheme?: string;
    coinsAwarded?: number;
    coinsTotal?: number;
    streakUpdate?: {
        playStreak: number;
        dailyCoins: number;
        milestone?: {
            day: number;
            coins: number;
            hintCredits: number;
        };
    };
    /** Actual time spent in the match, seconds. */
    matchDurationSec?: number;
}

export type HintAck =
    | {
          ok: true;
          position: number;
          letter: string;
          paidWith: 'free' | 'credit' | 'coins';
          coinsSpent: number;
          coinsRemaining: number;
          hintCreditsRemaining: number;
          freeRemaining: boolean;
          lifetimeHintsUsed: number;
      }
    | {
          ok: false;
          error: string;
          errorCode:
              | 'NO_POSITIONS_LEFT'
              | 'NOT_AFFORDABLE'
              | 'PER_MATCH_LIMIT'
              | 'GAME_NOT_ACTIVE'
              | 'NOT_FOUND';
      };
