import { query, pool } from '../db/pool.js';
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
}

const SAFE_USER_FIELDS = `
    id, username, auth_provider, auth_subject, email,
    rank_points, rank_tier, wins, losses, win_streak, best_streak,
    equipped_board_theme, equipped_victory_anim, equipped_avatar,
    equipped_nameplate, equipped_profile_border,
    battle_pass_xp, battle_pass_premium, battle_pass_season,
    ads_removed, powerup_reveal, powerup_scramble, powerup_lock,
    last_daily_ad_at,
    xp_boost_ads_today,
    to_char(xp_boost_ads_day, 'YYYY-MM-DD') AS xp_boost_ads_day,
    coins, hint_credits, play_streak, play_streak_best,
    to_char(last_play_date, 'YYYY-MM-DD') AS last_play_date,
    lifetime_hints_used, token_version
`;

export async function findUserById(id: string): Promise<UserRow | null> {
    const rows = await query<UserRow>(
        `SELECT ${SAFE_USER_FIELDS} FROM users WHERE id = $1`,
        [id]
    );
    return rows[0] ?? null;
}

export async function findUserByProviderSubject(
    provider: UserRow['auth_provider'],
    subject: string
): Promise<UserRow | null> {
    const rows = await query<UserRow>(
        `SELECT ${SAFE_USER_FIELDS} FROM users
         WHERE auth_provider = $1 AND auth_subject = $2`,
        [provider, subject]
    );
    return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
    const rows = await query<UserRow>(
        `SELECT ${SAFE_USER_FIELDS} FROM users WHERE lower(email) = lower($1)`,
        [email]
    );
    return rows[0] ?? null;
}

/** Returns the password hash for an email-auth user, or null. */
export async function getPasswordHash(userId: string): Promise<string | null> {
    const rows = await query<{ password_hash: string | null }>(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
    );
    return rows[0]?.password_hash ?? null;
}

export interface CreateUserArgs {
    username: string;
    provider: UserRow['auth_provider'];
    subject: string;
    email?: string | null;
    passwordHash?: string | null;
}

export async function createUser(args: CreateUserArgs): Promise<UserRow> {
    const rows = await query<UserRow>(
        `INSERT INTO users
            (username, auth_provider, auth_subject, email, password_hash,
             equipped_board_theme, equipped_victory_anim, equipped_avatar, equipped_nameplate)
         VALUES ($1, $2, $3, $4, $5, 'theme_classic', 'victory_pulse', 'avatar_default', 'nameplate_plain')
         RETURNING ${SAFE_USER_FIELDS}`,
        [
            args.username,
            args.provider,
            args.subject,
            args.email ?? null,
            args.passwordHash ?? null,
        ]
    );
    const user = rows[0]!;
    // Grant the default cosmetics to the new user so equipping logic stays
    // consistent (you can't equip something you don't own).
    await query(
        `INSERT INTO user_cosmetics (user_id, cosmetic_id, acquired_via)
         VALUES ($1, 'theme_classic', 'grant'),
                ($1, 'victory_pulse', 'grant'),
                ($1, 'avatar_default', 'grant'),
                ($1, 'nameplate_plain', 'grant')
         ON CONFLICT DO NOTHING`,
        [user.id]
    );
    return user;
}

/**
 * Atomically update rank, win/loss, and streak after a match. Also recomputes
 * the cached rank_tier.
 */
export async function applyMatchResult(args: {
    userId: string;
    isWinner: boolean;
    rankDelta: number;
}): Promise<UserRow> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cur = await client.query<UserRow>(
            `SELECT ${SAFE_USER_FIELDS} FROM users WHERE id = $1 FOR UPDATE`,
            [args.userId]
        );
        const u = cur.rows[0];
        if (!u) throw new Error(`User ${args.userId} not found`);

        const newPoints = Math.max(0, u.rank_points + args.rankDelta);
        const newWins = u.wins + (args.isWinner ? 1 : 0);
        const newLosses = u.losses + (args.isWinner ? 0 : 1);
        const newStreak = args.isWinner ? u.win_streak + 1 : 0;
        const newBestStreak = Math.max(u.best_streak, newStreak);
        const newTier = tierFromPoints(newPoints);

        const result = await client.query<UserRow>(
            `UPDATE users SET
                rank_points = $1, rank_tier = $2,
                wins = $3, losses = $4,
                win_streak = $5, best_streak = $6,
                updated_at = now()
             WHERE id = $7
             RETURNING ${SAFE_USER_FIELDS}`,
            [
                newPoints,
                newTier,
                newWins,
                newLosses,
                newStreak,
                newBestStreak,
                args.userId,
            ]
        );
        await client.query('COMMIT');
        return result.rows[0]!;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
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
    const col = colMap[category];
    if (!col) throw new Error(`Unknown cosmetic category: ${category}`);

    // Verify ownership before equipping (defense in depth — the route also
    // checks).
    const owns = await query<{ exists: boolean }>(
        `SELECT TRUE AS exists FROM user_cosmetics
         WHERE user_id = $1 AND cosmetic_id = $2`,
        [userId, cosmeticId]
    );
    if (owns.length === 0) throw new Error('Cosmetic not owned');

    await query(
        `UPDATE users SET ${col} = $1, updated_at = now() WHERE id = $2`,
        [cosmeticId, userId]
    );
}

/** Current token version for a user, or null if the user doesn't exist. */
export async function getTokenVersion(userId: string): Promise<number | null> {
    const rows = await query<{ token_version: number }>(
        'SELECT token_version FROM users WHERE id = $1',
        [userId]
    );
    return rows[0]?.token_version ?? null;
}

/** Session validity snapshot: token version + banned flag. Used by auth. */
export async function getSessionState(
    userId: string
): Promise<{ tokenVersion: number; banned: boolean } | null> {
    const rows = await query<{ token_version: number; banned: boolean }>(
        'SELECT token_version, banned FROM users WHERE id = $1',
        [userId]
    );
    const r = rows[0];
    return r ? { tokenVersion: r.token_version, banned: r.banned } : null;
}

/** Invalidate all outstanding sessions for a user by bumping their token
 *  version. Returns the new version. */
export async function bumpTokenVersion(userId: string): Promise<number> {
    const rows = await query<{ token_version: number }>(
        `UPDATE users SET token_version = token_version + 1, updated_at = now()
         WHERE id = $1 RETURNING token_version`,
        [userId]
    );
    return rows[0]?.token_version ?? 0;
}

/** Username must be 3-16 chars, letters/numbers/underscores only. */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

export function isValidUsername(name: string): boolean {
    return USERNAME_RE.test(name);
}

/** Persist the Apple refresh token captured at sign-in (see auth/apple.ts). */
export async function setAppleRefreshToken(userId: string, token: string): Promise<void> {
    await query('UPDATE users SET apple_refresh_token = $1, updated_at = now() WHERE id = $2', [
        token,
        userId,
    ]);
}

/**
 * Permanently delete a user and their data (GDPR / App Store "delete my
 * account" requirement). Most child tables cascade on the users FK; matches
 * and their guesses/replays do NOT cascade (they reference users without
 * ON DELETE), so we delete the user's matches first inside the same
 * transaction. Aggregate stats on the opponent's row (wins/losses) are
 * denormalized and unaffected.
 */
export async function deleteAccount(userId: string): Promise<void> {
    // Apple requires revoking Sign in with Apple tokens when the account goes
    // away. Best-effort and BEFORE the row is deleted (that's where the token
    // lives); a revoke failure never blocks the deletion itself.
    const tok = await query<{ apple_refresh_token: string | null }>(
        'SELECT apple_refresh_token FROM users WHERE id = $1',
        [userId]
    );
    const refresh = tok[0]?.apple_refresh_token;
    if (refresh) await revokeAppleRefreshToken(refresh);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Removes the user's matches → cascades their guesses + replays.
        await client.query(
            'DELETE FROM matches WHERE player1_id = $1 OR player2_id = $1',
            [userId]
        );
        // Removes the user → cascades coins, cosmetics, friendships,
        // leaderboard entries, mystery submissions, iap_transactions, etc.
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
