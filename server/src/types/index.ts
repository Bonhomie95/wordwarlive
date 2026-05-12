// Shared protocol types. Mirrored verbatim in mobile/src/types/index.ts.
// When you change the wire format, change BOTH files.

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

/** What the client sees about itself or any other user. Never includes
 *  password hashes, oauth subjects, or anything sensitive. */
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

export interface BattlePassState {
    seasonNumber: number;
    name: string;
    endsAt: string; // ISO
    xp: number;
    xpPerTier: number;
    currentTier: number;
    maxTier: number;
    premium: boolean;
    rewards: BattlePassReward[];
}

export interface BattlePassReward {
    tier: number;
    track: 'free' | 'premium';
    cosmeticId: string | null;
    claimed: boolean;
    /** True if this user has crossed the XP threshold for this tier. */
    unlocked: boolean;
}

// ─── Socket.io protocol ────────────────────────────────────────────────────

export interface ClientToServerEvents {
    /** Enter the matchmaking queue. */
    queue_join: () => void;
    /** Leave the queue (the user backed out before a match was found). */
    queue_leave: () => void;
    /** Submit a guess in the active match. */
    guess_submit: (
        payload: { guess: string },
        ack: (resp: GuessAck) => void
    ) => void;
    /** Spend a power-up. */
    powerup_use: (
        payload: { kind: PowerUp; targetGuessIndex?: number },
        ack: (resp: { ok: boolean; error?: string }) => void
    ) => void;
    /** Request a hint. The server picks an unrevealed correct letter and
     *  charges the user (free / credit / coins waterfall). */
    hint_request: (
        payload: Record<string, never>,
        ack: (resp: HintAck) => void
    ) => void;
    /** Reattach to an in-flight match after a brief disconnect. The server
     *  replays match state (players, current grids, timer) on success.
     *  Times out if no match is found or the grace period has expired. */
    match_resume: (
        payload: Record<string, never>,
        ack: (resp: { ok: boolean; reason?: string }) => void
    ) => void;
    /** Forfeit the current match. Opponent wins immediately. The quitter
     *  gets the loss recorded normally (rank delta, stats, etc.). Unlike
     *  a disconnect, no grace period — this is an explicit choice. */
    match_quit: (
        payload: Record<string, never>,
        ack: (resp: { ok: boolean; reason?: string }) => void
    ) => void;
}

export interface ServerToClientEvents {
    queue_status: (payload: QueueStatus) => void;
    match_found: (payload: MatchFound) => void;
    match_start: (payload: MatchStart) => void;
    /** Pushed to BOTH players whenever either submits a guess. */
    guess_result: (payload: GuessBroadcast) => void;
    /** Push that the opponent's screen got scrambled (visual only). */
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
    /** Same length as `word`. The word itself is NEVER sent. */
    wordLength: number;
    durationSeconds: number;
    you: PublicUser;
    opponent: PublicUser;
    /** Which slot you are in the match (1 or 2). Affects how rank deltas
     *  are reported back. */
    slot: 1 | 2;
}

export interface MatchStart {
    matchId: string;
    /** Server clock at start, ms since epoch. */
    startedAt: number;
}

export interface GuessAck {
    ok: boolean;
    error?: string;
    errorCode?: 'WRONG_LENGTH' | 'NOT_IN_WORD_BANK' | 'NON_ALPHABETIC' | 'RATE_LIMITED' | 'GAME_NOT_ACTIVE';
}

/** Whose grid is being updated. The opponent's tiles are also sent (we
 *  reveal the colors but never the letters — see redactedGuess). */
export interface GuessBroadcast {
    matchId: string;
    /** 'me' or 'opponent' from the recipient's POV. */
    side: 'me' | 'opponent';
    guessIndex: number;
    /** The actual letters — only sent for 'me'. For the opponent it's null. */
    guess: string | null;
    tiles: Tile[];
    solved: boolean;
}

export interface MatchOver {
    matchId: string;
    /** 'win' | 'loss' | 'tie' from the recipient's POV. */
    result: 'win' | 'loss' | 'tie';
    outcome:
        | 'p1_solved'
        | 'p2_solved'
        | 'p1_more_correct'
        | 'p2_more_correct'
        | 'tie'
        | 'forfeit';
    /** Now that the game's over, both players see the answer. */
    word: string;
    /** Rank delta APPLIED to the recipient. Positive = gained points. */
    rankDelta: number;
    newRankPoints: number;
    newRankTier: RankTier;
    /** XP awarded toward the battle pass for this match. */
    battlePassXpAwarded: number;
    /** Both players' full guess histories revealed (so you can analyze the
     *  opponent's strategy on the post-game screen). */
    yourGuesses: Array<{ guess: string; tiles: Tile[] }>;
    opponentGuesses: Array<{ guess: string; tiles: Tile[] }>;
    /** Optional: an on-theme one-liner about the word, generated by Groq
     *  for the daily word, blank otherwise. */
    wordTheme?: string;
    /** Coins awarded for this match (match-win bonus). */
    coinsAwarded?: number;
    /** Total coins after the match. */
    coinsTotal?: number;
    /** Daily play-streak update applied as a result of this match. Only
     *  populated if this match advanced the streak (first match of a new
     *  UTC day). */
    streakUpdate?: {
        playStreak: number;
        dailyCoins: number;
        milestone?: {
            day: number;
            coins: number;
            hintCredits: number;
        };
    };
    /** Actual time spent in the match, seconds. Used by the client for
     *  ad-cadence decisions (long matches → safe to interrupt with an
     *  interstitial; short matches → let the player right back in). */
    matchDurationSec: number;
}

export type HintAck =
    | {
          ok: true;
          /** 0-indexed position in the target word. */
          position: number;
          /** Single uppercase letter at that position. */
          letter: string;
          paidWith: 'free' | 'credit' | 'coins';
          coinsSpent: number;
          coinsRemaining: number;
          hintCreditsRemaining: number;
          /** Always false now — only one hint per match, period. Kept for
           *  client-side compat. */
          freeRemaining: boolean;
          /** Total hints the user has ever taken across all matches.
           *  When 0 → next-ever hint is free. */
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
