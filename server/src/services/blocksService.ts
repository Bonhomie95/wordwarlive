// User blocking. A block is one-directional in intent (A blocks B) but its
// EFFECTS are symmetric: once either side has blocked the other, they are never
// matched together (random or mystery), can't challenge each other, and any
// friendship between them is removed.

import { col, registerIndexes } from '../db/mongo.js';
import { removeFriend } from './friendsService.js';

interface UserBlockDoc {
    blocker_id: string;
    blocked_id: string;
    created_at: Date;
}

registerIndexes('user_blocks', [
    { key: { blocker_id: 1, blocked_id: 1 }, unique: true },
    { key: { blocked_id: 1 } },
]);

const blocks = () => col<UserBlockDoc>('user_blocks');

export async function blockUser(
    blockerId: string,
    blockedId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (blockerId === blockedId) {
        return { ok: false, error: "You can't block yourself." };
    }
    await blocks().updateOne(
        { blocker_id: blockerId, blocked_id: blockedId },
        { $setOnInsert: { created_at: new Date() } },
        { upsert: true }
    );
    // Blocking also ends any friendship so a blocked ex-friend can't challenge.
    await removeFriend(blockerId, blockedId).catch(() => {});
    return { ok: true };
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await blocks().deleteOne({ blocker_id: blockerId, blocked_id: blockedId });
}

export interface BlockedUser {
    userId: string;
    username: string;
    rankPoints: number;
    rankTier: string;
    createdAt: string;
}

export async function listBlocked(blockerId: string): Promise<BlockedUser[]> {
    const rows = await blocks()
        .find({ blocker_id: blockerId }, { projection: { _id: 0 } })
        .sort({ created_at: -1 })
        .toArray();
    if (rows.length === 0) return [];
    const usersById = new Map(
        (await col<{ id: string; username: string; rank_points: number; rank_tier: string }>('users')
            .find({ id: { $in: rows.map((r) => r.blocked_id) } },
                { projection: { _id: 0, id: 1, username: 1, rank_points: 1, rank_tier: 1 } })
            .toArray()).map((u) => [u.id, u])
    );
    return rows.flatMap((r) => {
        const u = usersById.get(r.blocked_id);
        if (!u) return []; // inner join: blocked user no longer exists
        return [{
            userId: r.blocked_id,
            username: u.username,
            rankPoints: u.rank_points,
            rankTier: u.rank_tier,
            createdAt: r.created_at.toISOString(),
        }];
    });
}

/** Every user id the given user must NOT be matched with — union of both
 *  directions (they blocked X, or X blocked them). */
export async function getBlockedIdsFor(userId: string): Promise<string[]> {
    const rows = await blocks()
        .find({ $or: [{ blocker_id: userId }, { blocked_id: userId }] },
            { projection: { _id: 0, blocker_id: 1, blocked_id: 1 } })
        .toArray();
    return [...new Set(rows.map((r) => (r.blocker_id === userId ? r.blocked_id : r.blocker_id)))];
}

/** True if either user has blocked the other. */
export async function isBlockedEither(a: string, b: string): Promise<boolean> {
    const row = await blocks().findOne(
        { $or: [{ blocker_id: a, blocked_id: b }, { blocker_id: b, blocked_id: a }] },
        { projection: { _id: 1 } }
    );
    return row !== null;
}
