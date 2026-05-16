// Friends + private matches.
//
// Two systems:
//   - friend_invite_codes: short codes for "add me as a friend"
//   - private_match_invites: short codes for "challenge me to a 1v1 match"
//
// Both are short-lived (15min default). The actual private match creation
// happens via a socket event 'private_join' — when the code resolves to a
// host who's connected, we pair them up. If the host isn't online, the
// joiner gets an error.

import { randomBytes } from 'node:crypto';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function generateCode(): string {
    // 6 character alphanumeric. Skip easily-confused chars.
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(6);
    let out = '';
    for (let i = 0; i < 6; i++) {
        out += ALPHABET[bytes[i]! % ALPHABET.length];
    }
    return out;
}

// ─── Friend invite codes ────────────────────────────────────────────────────

export async function createFriendInviteCode(userId: string): Promise<string> {
    // Clean up old codes for this user first.
    await query('DELETE FROM friend_invite_codes WHERE user_id = $1', [userId]);

    const code = generateCode();
    await query(
        `INSERT INTO friend_invite_codes(code, user_id, expires_at)
         VALUES ($1, $2, now() + interval '15 minutes')`,
        [code, userId]
    );
    return code;
}

export async function redeemFriendInviteCode(
    code: string,
    redeemingUserId: string
): Promise<{ ok: true; friendUserId: string; friendUsername: string } | { ok: false; error: string }> {
    const rows = await query<{ user_id: string; expires_at: Date }>(
        `SELECT user_id, expires_at FROM friend_invite_codes WHERE code = $1`,
        [code.toUpperCase()]
    );
    const r = rows[0];
    if (!r) return { ok: false, error: 'Invalid code.' };
    if (r.expires_at.getTime() < Date.now()) {
        return { ok: false, error: 'Code expired.' };
    }
    if (r.user_id === redeemingUserId) {
        return { ok: false, error: "That's your own code." };
    }

    const friendId = r.user_id;
    const friendRows = await query<{ username: string }>(
        'SELECT username FROM users WHERE id = $1',
        [friendId]
    );
    if (!friendRows[0]) return { ok: false, error: 'User not found.' };

    // Insert both rows so lookup is symmetric.
    await query(
        `INSERT INTO friendships(user_id, friend_id, status)
         VALUES ($1, $2, 'accepted'), ($2, $1, 'accepted')
         ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`,
        [friendId, redeemingUserId]
    );

    // Burn the code so it can't be reused.
    await query('DELETE FROM friend_invite_codes WHERE code = $1', [code.toUpperCase()]);

    logger.info({ user1: friendId, user2: redeemingUserId }, 'friendship created');
    return {
        ok: true,
        friendUserId: friendId,
        friendUsername: friendRows[0].username,
    };
}

export interface FriendInfo {
    userId: string;
    username: string;
    rankPoints: number;
    rankTier: string;
    isOnline: boolean;
}

export async function listFriends(userId: string): Promise<FriendInfo[]> {
    const rows = await query<{
        id: string;
        username: string;
        rank_points: number;
        rank_tier: string;
    }>(
        `SELECT u.id, u.username, u.rank_points, u.rank_tier
         FROM friendships f
         JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = $1 AND f.status = 'accepted'
         ORDER BY u.username ASC`,
        [userId]
    );
    return rows.map((r) => ({
        userId: r.id,
        username: r.username,
        rankPoints: r.rank_points,
        rankTier: r.rank_tier,
        isOnline: false, // Filled in by the route from the socket presence map.
    }));
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
    await query(
        `DELETE FROM friendships
         WHERE (user_id = $1 AND friend_id = $2)
            OR (user_id = $2 AND friend_id = $1)`,
        [userId, friendId]
    );
}

/** True if `friendId` is an accepted friend of `userId`. Used by the
 *  friend-challenge socket flow to make sure you can only challenge
 *  people who are actually on your list. */
export async function areFriends(
    userId: string,
    friendId: string
): Promise<boolean> {
    const rows = await query(
        `SELECT 1 FROM friendships
         WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'`,
        [userId, friendId]
    );
    return rows.length > 0;
}

// ─── Private match invites ──────────────────────────────────────────────────

export async function createPrivateMatchCode(
    userId: string,
    wordLength: number | null
): Promise<string> {
    await query('DELETE FROM private_match_invites WHERE host_id = $1', [userId]);
    const code = generateCode();
    await query(
        `INSERT INTO private_match_invites(code, host_id, word_length, expires_at)
         VALUES ($1, $2, $3, now() + interval '15 minutes')`,
        [code, userId, wordLength]
    );
    return code;
}

export async function resolvePrivateMatchCode(
    code: string
): Promise<{ hostId: string; wordLength: number | null } | null> {
    const rows = await query<{
        host_id: string;
        word_length: number | null;
        expires_at: Date;
    }>(
        `SELECT host_id, word_length, expires_at
         FROM private_match_invites WHERE code = $1`,
        [code.toUpperCase()]
    );
    const r = rows[0];
    if (!r) return null;
    if (r.expires_at.getTime() < Date.now()) return null;
    return { hostId: r.host_id, wordLength: r.word_length };
}

export async function consumePrivateMatchCode(code: string): Promise<void> {
    await query('DELETE FROM private_match_invites WHERE code = $1', [
        code.toUpperCase(),
    ]);
}
