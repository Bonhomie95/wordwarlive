import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';
import { col, newId, registerIndexes } from '../db/mongo.js';
import { tierFromPoints } from '../game/ranks.js';
import { revokeAppleRefreshToken } from '../auth/apple.js';

export interface UserRow {
    id: string;
    username: string;
    auth_provider: 'anonymous' | 'email' | 'google' | 'apple';
    auth_subject: string;
    email: string | null;
    rank_points: number;
    rank_tier: string;
    wins: number;
    losses: number;
    win_streak: number;
    best_streak: number;
    equipped_board_theme: string | null;
    equipped_victory_anim: string | null;
    equipped_avatar: string | null;
    equipped_nameplate: string | null;
    equipped_profile_border: string | null;
    battle_pass_xp: number;
    battle_pass_premium: boolean;
    battle_pass_season: number;
    ads_removed: boolean;
    powerup_reveal: number;
    powerup_scramble: number;
    powerup_lock: number;
    last_daily_ad_at: Date | null;
    xp_boost_ads_today: number;
    xp_boost_ads_day: string | null;
    coins: number;
    hint_credits: number;
    play_streak: number;
    play_streak_best: number;
    last_play_date: string | null;
    lifetime_hints_used: number;
    token_version: number;
    streak_shields: number;
    xp_boost_until: Date | null;
    starter_bundle_at: Date | null;
    coin_ads_today: number;
    coin_ads_day: string | null;
    username_changed_at: Date | null;
}

/** Full `users` document: UserRow plus the columns we never hand to callers. */
export interface UserDoc extends UserRow {
    password_hash: string | null;
    apple_refresh_token: string | null;
    settings: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
    last_rank_season_reset_id: number | null;
    is_admin: boolean;
    is_super_admin: boolean;
    banned: boolean;
    banned_reason: string | null;
    banned_at: Date | null;
    banned_by: string | null;
}

/** Case-insensitive match, used for the username/email lookups and indexes. */
export const CI = { locale: 'en', strength: 2 } as const;

registerIndexes('users', [
    { key: { id: 1 }, unique: true },
    { key: { auth_provider: 1, auth_subject: 1 }, unique: true },
    { key: { username: 1 }, unique: true, collation: CI },
    { key: { email: 1 }, unique: true, collation: CI, partialFilterExpression: { email: { $type: 'string' } } },
    { key: { rank_points: -1 } },
    { key: { created_at: -1 } },
    { key: { last_play_date: -1 } },
    { key: { banned: 1 }, partialFilterExpression: { banned: true } },
]);

export const users = () => col<UserDoc>('users');

const SAFE_USER_FIELDS: (keyof UserRow)[] = [
    'id', 'username', 'auth_provider', 'auth_subject', 'email',
    'rank_points', 'rank_tier', 'wins', 'losses', 'win_streak', 'best_streak',
    'equipped_board_theme', 'equipped_victory_anim', 'equipped_avatar',
    'equipped_nameplate', 'equipped_profile_border',
    'battle_pass_xp', 'battle_pass_premium', 'battle_pass_season',
    'ads_removed', 'powerup_reveal', 'powerup_scramble', 'powerup_lock',
    'last_daily_ad_at', 'xp_boost_ads_today', 'xp_boost_ads_day',
    'coins', 'hint_credits', 'play_streak', 'play_streak_best', 'last_play_date',
    'lifetime_hints_used', 'token_version',
    'streak_shields', 'xp_boost_until', 'starter_bundle_at',
    'coin_ads_today', 'coin_ads_day', 'username_changed_at',
];

/** Projection equivalent of the old `SELECT <safe fields>`; shared by other services. */
export const SAFE_USER_PROJECTION: Record<string, 0 | 1> = Object.fromEntries(
    [['_id', 0], ...SAFE_USER_FIELDS.map((f) => [f, 1])]
);

export async function findUserById(id: string): Promise<UserRow | null> {
    return (await users().findOne({ id }, { projection: SAFE_USER_PROJECTION })) as UserRow | null;
}

export async function findUserByProviderSubject(
    provider: UserRow['auth_provider'],
    subject: string
): Promise<UserRow | null> {
    return (await users().findOne(
        { auth_provider: provider, auth_subject: subject },
        { projection: SAFE_USER_PROJECTION }
    )) as UserRow | null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
    return (await users().findOne({ email }, { projection: SAFE_USER_PROJECTION, collation: CI })) as UserRow | null;
}

/** Id of the user holding `username` (case-insensitive), or null. */
export async function findUserIdByUsername(username: string): Promise<string | null> {
    const u = await users().findOne({ username }, { projection: { _id: 0, id: 1 }, collation: CI });
    return u?.id ?? null;
}

/** Returns the password hash for an email-auth user, or null. */
export async function getPasswordHash(userId: string): Promise<string | null> {
    const u = await users().findOne({ id: userId }, { projection: { _id: 0, password_hash: 1 } });
    return u?.password_hash ?? null;
}

export interface CreateUserArgs {
    username: string;
    provider: UserRow['auth_provider'];
    subject: string;
    email?: string | null;
    passwordHash?: string | null;
}

export async function createUser(args: CreateUserArgs): Promise<UserRow> {
    const now = new Date();
    const doc: UserDoc = {
        id: newId(),
        username: args.username,
        auth_provider: args.provider,
        auth_subject: args.subject,
        email: args.email ?? null,
        password_hash: args.passwordHash ?? null,
        rank_points: 1000,
        rank_tier: 'stone',
        wins: 0,
        losses: 0,
        win_streak: 0,
        best_streak: 0,
        equipped_board_theme: 'theme_classic',
        equipped_victory_anim: 'victory_pulse',
        equipped_avatar: 'avatar_default',
        equipped_nameplate: 'nameplate_plain',
        equipped_profile_border: null,
        battle_pass_xp: 0,
        battle_pass_premium: false,
        battle_pass_season: 1,
        created_at: now,
        updated_at: now,
        ads_removed: false,
        powerup_reveal: 0,
        powerup_scramble: 0,
        powerup_lock: 0,
        last_daily_ad_at: null,
        xp_boost_ads_today: 0,
        xp_boost_ads_day: null,
        coins: 0,
        hint_credits: 0,
        play_streak: 0,
        play_streak_best: 0,
        last_play_date: null,
        lifetime_hints_used: 0,
        settings: { sound: true, haptics: true, colorBlindMode: false },
        last_rank_season_reset_id: null,
        token_version: 0,
        is_admin: false,
        is_super_admin: false,
        banned: false,
        banned_reason: null,
        banned_at: null,
        banned_by: null,
        apple_refresh_token: null,
        streak_shields: 0,
        xp_boost_until: null,
        starter_bundle_at: null,
        coin_ads_today: 0,
        coin_ads_day: null,
        username_changed_at: null,
    };
    await users().insertOne({ ...doc });
    // Grant the default cosmetics to the new user so equipping logic stays
    // consistent (you can't equip something you don't own).
    const grants = ['theme_classic', 'victory_pulse', 'avatar_default', 'nameplate_plain'].map((cosmetic_id) => ({
        user_id: doc.id, cosmetic_id, acquired_via: 'grant', acquired_at: now,
    }));
    await col('user_cosmetics').insertMany(grants, { ordered: false }).catch((err) => {
        if (err?.code !== 11000) throw err; // ON CONFLICT DO NOTHING
    });
    const user: Record<string, unknown> = {};
    for (const f of SAFE_USER_FIELDS) user[f] = doc[f];
    return user as unknown as UserRow;
}

/**
 * Update rank, win/loss, and streak after a match. Also recomputes the cached
 * rank_tier.
 */
// ponytail: read-then-write, no row lock; two simultaneous match results for
// the same user could clobber each other. Move to a $inc/$max pipeline update
// if concurrent settlements for one user ever happen.
export async function applyMatchResult(args: {
    userId: string;
    isWinner: boolean;
    rankDelta: number;
}): Promise<UserRow> {
    const u = await findUserById(args.userId);
    if (!u) throw new Error(`User ${args.userId} not found`);

    const newPoints = Math.max(0, u.rank_points + args.rankDelta);
    const newStreak = args.isWinner ? u.win_streak + 1 : 0;
    const out = await users().findOneAndUpdate(
        { id: args.userId },
        {
            $set: {
                rank_points: newPoints,
                rank_tier: tierFromPoints(newPoints),
                wins: u.wins + (args.isWinner ? 1 : 0),
                losses: u.losses + (args.isWinner ? 0 : 1),
                win_streak: newStreak,
                best_streak: Math.max(u.best_streak, newStreak),
                updated_at: new Date(),
            },
        },
        { returnDocument: 'after', projection: SAFE_USER_PROJECTION }
    );
    return out as unknown as UserRow;
}

export async function updateEquippedCosmetic(
    userId: string,
    category: string,
    cosmeticId: string
): Promise<void> {
    const colMap: Record<string, string> = {
        board_theme: 'equipped_board_theme',
        victory_anim: 'equipped_victory_anim',
        avatar: 'equipped_avatar',
        nameplate: 'equipped_nameplate',
        profile_border: 'equipped_profile_border',
    };
    const field = colMap[category];
    if (!field) throw new Error(`Unknown cosmetic category: ${category}`);

    // Verify ownership before equipping (defense in depth — the route also
    // checks).
    const owns = await col('user_cosmetics').findOne(
        { user_id: userId, cosmetic_id: cosmeticId },
        { projection: { _id: 1 } }
    );
    if (!owns) throw new Error('Cosmetic not owned');

    await users().updateOne({ id: userId }, { $set: { [field]: cosmeticId, updated_at: new Date() } });
}

/** Current token version for a user, or null if the user doesn't exist. */
export async function getTokenVersion(userId: string): Promise<number | null> {
    const u = await users().findOne({ id: userId }, { projection: { _id: 0, token_version: 1 } });
    return u?.token_version ?? null;
}

/** Session validity snapshot: token version + banned flag. Used by auth. */
export async function getSessionState(
    userId: string
): Promise<{ tokenVersion: number; banned: boolean } | null> {
    const u = await users().findOne({ id: userId }, { projection: { _id: 0, token_version: 1, banned: 1 } });
    return u ? { tokenVersion: u.token_version, banned: u.banned === true } : null;
}

/** Invalidate all outstanding sessions for a user by bumping their token
 *  version. Returns the new version. */
export async function bumpTokenVersion(userId: string): Promise<number> {
    const u = await users().findOneAndUpdate(
        { id: userId },
        { $inc: { token_version: 1 }, $set: { updated_at: new Date() } },
        { returnDocument: 'after', projection: { _id: 0, token_version: 1 } }
    );
    await redis.publish('wordwar:session-revoked', userId).catch((err) => logger.error({ err, userId }, 'Session revocation broadcast failed'));
    return u?.token_version ?? 0;
}

/** Username must be 3-16 chars, letters/numbers/underscores only. */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

export function isValidUsername(name: string): boolean {
    return USERNAME_RE.test(name);
}

/** Coins charged for a rename. The first rename is free (guests get an
 *  auto-generated name), every later one costs this. */
export const USERNAME_CHANGE_COST = 300;

export function usernameChangeCost(u: Pick<UserRow, 'username_changed_at'>): number {
    return u.username_changed_at ? USERNAME_CHANGE_COST : 0;
}

/**
 * Rename the account. Validation (format + profanity) is the route's job;
 * this handles uniqueness, the coin charge, and the timestamp atomically.
 */
export async function changeUsername(
    userId: string,
    username: string
): Promise<{ ok: true; coinsSpent: number } | { ok: false; error: 'TAKEN' | 'NOT_AFFORDABLE' | 'NOT_FOUND' }> {
    const u = await users().findOne(
        { id: userId },
        { projection: { _id: 0, username_changed_at: 1, coins: 1, username: 1 } }
    );
    if (!u) return { ok: false, error: 'NOT_FOUND' };
    const taken = await users().findOne(
        { username, id: { $ne: userId } },
        { projection: { _id: 1 }, collation: CI }
    );
    if (taken) return { ok: false, error: 'TAKEN' };
    const cost = usernameChangeCost(u);
    if (u.coins < cost) return { ok: false, error: 'NOT_AFFORDABLE' };
    // The `coins >= cost` filter keeps the balance non-negative without a lock.
    let res;
    try {
        res = await users().updateOne(
            { id: userId, coins: { $gte: cost } },
            { $set: { username, username_changed_at: new Date(), updated_at: new Date() }, $inc: { coins: -cost } }
        );
    } catch (err: any) {
        if (err?.code === 11000) return { ok: false, error: 'TAKEN' };
        throw err;
    }
    if (res.matchedCount === 0) return { ok: false, error: 'NOT_AFFORDABLE' };
    if (cost > 0) {
        await col('coin_grants').insertOne({
            id: newId(), user_id: userId, amount: -cost, source: 'username_spend',
            metadata: { from: u.username, to: username }, created_at: new Date(),
        });
    }
    return { ok: true, coinsSpent: cost };
}

/** Persist the Apple refresh token captured at sign-in (see auth/apple.ts). */
export async function setAppleRefreshToken(userId: string, token: string): Promise<void> {
    await users().updateOne({ id: userId }, { $set: { apple_refresh_token: token, updated_at: new Date() } });
}

/**
 * Permanently delete a user and their data (GDPR / App Store "delete my
 * account" requirement). Postgres cascaded the child tables on the users FK;
 * here every collection that referenced users(id) ON DELETE CASCADE is listed
 * explicitly. Matches did NOT cascade, so the user's matches (and their
 * guesses/replays, which cascade on the match) are removed first. Aggregate
 * stats on the opponent's row (wins/losses) are denormalized and unaffected.
 */
export class AppleRevocationPendingError extends Error {
    constructor() {
        super('Apple could not disconnect your sign-in. Your account has not been deleted. Please retry shortly or contact support.');
    }
}

/** collection → fields that referenced users(id) ON DELETE CASCADE. */
const USER_CASCADES: Array<[string, string[]]> = [
    ['ad_rewards', ['user_id']],
    ['battle_pass_claims', ['user_id']],
    ['coin_grants', ['user_id']],
    ['daily_challenge_attempts', ['user_id']],
    ['friend_invite_codes', ['user_id']],
    ['friendships', ['user_id', 'friend_id']],
    ['hint_uses', ['user_id']],
    ['leaderboard_entries', ['user_id']],
    ['mystery_submissions', ['user_id']],
    ['private_match_invites', ['host_id']],
    ['rank_season_results', ['user_id']],
    ['user_cosmetics', ['user_id']],
    ['iap_transactions', ['user_id']],
    ['content_reports', ['reporter_id']],
    ['push_tokens', ['user_id']],
    ['user_blocks', ['blocker_id', 'blocked_id']],
    ['product_events', ['user_id']],
    ['inventory_history', ['user_id']],
    ['match_checkpoints', ['p1_id', 'p2_id', 'state.p1UserId', 'state.p2UserId']],
];

export async function deleteAccount(userId: string): Promise<void> {
    // Apple requires revoking Sign in with Apple tokens when the account goes
    // away. Keep the token/account available for retry if Apple is unavailable.
    const tok = await users().findOne({ id: userId }, { projection: { _id: 0, apple_refresh_token: 1 } });
    const refresh = tok?.apple_refresh_token;
    if (refresh && !(await revokeAppleRefreshToken(refresh))) {
        throw new AppleRevocationPendingError();
    }

    // ponytail: no multi-document transaction; a crash mid-way leaves orphans
    // that a re-run of deleteAccount cleans up (every step is idempotent).
    const matchIds = (await col('matches')
        .find({ $or: [{ player1_id: userId }, { player2_id: userId }] }, { projection: { _id: 0, id: 1 } })
        .toArray()).map((m) => m.id as string);
    if (matchIds.length) {
        await col('guesses').deleteMany({ match_id: { $in: matchIds } });
        await col('match_replays').deleteMany({ match_id: { $in: matchIds } });
        await col('matches').deleteMany({ id: { $in: matchIds } });
    }
    for (const [name, fields] of USER_CASCADES) {
        await col(name).deleteMany({ $or: fields.map((f) => ({ [f]: userId })) });
    }
    await users().deleteOne({ id: userId });
    await redis.publish('wordwar:session-revoked', userId).catch((err) => logger.error({ err, userId }, 'Session revocation broadcast failed'));
}
