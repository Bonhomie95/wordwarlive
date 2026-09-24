// User blocking. A block is one-directional in intent (A blocks B) but its
// EFFECTS are symmetric: once either side has blocked the other, they are never
// matched together (random or mystery), can't challenge each other, and any
// friendship between them is removed.

import { query } from '../db/pool.js';
import { removeFriend } from './friendsService.js';

export async function blockUser(
    blockerId: string,
    blockedId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (blockerId === blockedId) {
        return { ok: false, error: "You can't block yourself." };
    }
    await query(
        `INSERT INTO user_blocks (blocker_id, blocked_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [blockerId, blockedId]
    );
    // Blocking also ends any friendship so a blocked ex-friend can't challenge.
    await removeFriend(blockerId, blockedId).catch(() => {});
    return { ok: true };
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await query(
        `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
        [blockerId, blockedId]
    );
}

export interface BlockedUser {
    userId: string;
    username: string;
    rankPoints: number;
    rankTier: string;
    createdAt: string;
}

export async function listBlocked(blockerId: string): Promise<BlockedUser[]> {
    return query<BlockedUser>(
        `SELECT b.blocked_id AS "userId", u.username,
                u.rank_points AS "rankPoints", u.rank_tier AS "rankTier",
                b.created_at AS "createdAt"
         FROM user_blocks b
         JOIN users u ON u.id = b.blocked_id
         WHERE b.blocker_id = $1
         ORDER BY b.created_at DESC`,
        [blockerId]
    );
}

/** Every user id the given user must NOT be matched with — union of both
 *  directions (they blocked X, or X blocked them). */
export async function getBlockedIdsFor(userId: string): Promise<string[]> {
    const rows = await query<{ id: string }>(
        `SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = $1
         UNION
         SELECT blocker_id AS id FROM user_blocks WHERE blocked_id = $1`,
        [userId]
    );
    return rows.map((r) => r.id);
}

/** True if either user has blocked the other. */
export async function isBlockedEither(a: string, b: string): Promise<boolean> {
    const rows = await query(
        `SELECT 1 FROM user_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)
         LIMIT 1`,
        [a, b]
    );
    return rows.length > 0;
}
