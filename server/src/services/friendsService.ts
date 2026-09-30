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
import { col, registerIndexes } from '../db/mongo.js';
import { logger } from '../utils/logger.js';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface FriendInviteCodeDoc {
    code: string;
    user_id: string;
    expires_at: Date;
    created_at: Date;
}
interface FriendshipDoc {
    user_id: string;
    friend_id: string;
    status: string;
    created_at: Date;
}
interface PrivateMatchInviteDoc {
    code: string;
    host_id: string;
    word_length: number | null;
    expires_at: Date;
    created_at: Date;
}

registerIndexes('friend_invite_codes', [
    { key: { code: 1 }, unique: true },
    { key: { user_id: 1 } },
]);
registerIndexes('friendships', [
    { key: { user_id: 1, friend_id: 1 }, unique: true },
    { key: { friend_id: 1 } },
    { key: { status: 1 } },
]);
registerIndexes('private_match_invites', [
    { key: { code: 1 }, unique: true },
    { key: { host_id: 1 } },
]);

const inviteCodes = () => col<FriendInviteCodeDoc>('friend_invite_codes');
const friendships = () => col<FriendshipDoc>('friendships');
const matchInvites = () => col<PrivateMatchInviteDoc>('private_match_invites');

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
    await inviteCodes().deleteMany({ user_id: userId });

    const code = generateCode();
    const now = new Date();
    await inviteCodes().insertOne({
        code, user_id: userId, expires_at: new Date(now.getTime() + CODE_TTL_MS), created_at: now,
    });
    return code;
}

export async function redeemFriendInviteCode(
    code: string,
    redeemingUserId: string
): Promise<{ ok: true; friendUserId: string; friendUsername: string } | { ok: false; error: string }> {
    const r = await inviteCodes().findOne({ code: code.toUpperCase() });
    if (!r) return { ok: false, error: 'Invalid code.' };
    if (r.expires_at.getTime() < Date.now()) {
        return { ok: false, error: 'Code expired.' };
    }
    if (r.user_id === redeemingUserId) {
        return { ok: false, error: "That's your own code." };
    }

    const friendId = r.user_id;
    const friend = await col<{ id: string; username: string }>('users')
        .findOne({ id: friendId }, { projection: { _id: 0, username: 1 } });
    if (!friend) return { ok: false, error: 'User not found.' };

    await befriend(friendId, redeemingUserId);

    // Burn the code so it can't be reused.
    await inviteCodes().deleteOne({ code: code.toUpperCase() });

    logger.info({ user1: friendId, user2: redeemingUserId }, 'friendship created');
    return {
        ok: true,
        friendUserId: friendId,
        friendUsername: friend.username,
    };
}

/** Make two users friends (both directions, idempotent). */
export async function befriend(a: string, b: string): Promise<void> {
    const now = new Date();
    for (const [user_id, friend_id] of [[a, b], [b, a]] as const) {
        await friendships().updateOne(
            { user_id, friend_id },
            { $set: { status: 'accepted' }, $setOnInsert: { created_at: now } },
            { upsert: true }
        );
    }
}

export interface FriendInfo {
    userId: string;
    username: string;
    rankPoints: number;
    rankTier: string;
    isOnline: boolean;
}

export async function listFriends(userId: string): Promise<FriendInfo[]> {
    const links = await friendships()
        .find({ user_id: userId, status: 'accepted' }, { projection: { _id: 0, friend_id: 1 } })
        .toArray();
    if (links.length === 0) return [];
    const rows = await col<{ id: string; username: string; rank_points: number; rank_tier: string }>('users')
        .find({ id: { $in: links.map((l) => l.friend_id) } },
            { projection: { _id: 0, id: 1, username: 1, rank_points: 1, rank_tier: 1 } })
        .sort({ username: 1 })
        .toArray();
    return rows.map((r) => ({
        userId: r.id,
        username: r.username,
        rankPoints: r.rank_points,
        rankTier: r.rank_tier,
        isOnline: false, // Filled in by the route from the socket presence map.
    }));
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
    await friendships().deleteMany({
        $or: [
            { user_id: userId, friend_id: friendId },
            { user_id: friendId, friend_id: userId },
        ],
    });
}

/** True if `friendId` is an accepted friend of `userId`. Used by the
 *  friend-challenge socket flow to make sure you can only challenge
 *  people who are actually on your list. */
export async function areFriends(
    userId: string,
    friendId: string
): Promise<boolean> {
    const row = await friendships().findOne(
        { user_id: userId, friend_id: friendId, status: 'accepted' },
        { projection: { _id: 1 } }
    );
    return row !== null;
}

// ─── Private match invites ──────────────────────────────────────────────────

export async function createPrivateMatchCode(
    userId: string,
    wordLength: number | null
): Promise<string> {
    await matchInvites().deleteMany({ host_id: userId });
    const code = generateCode();
    const now = new Date();
    await matchInvites().insertOne({
        code, host_id: userId, word_length: wordLength,
        expires_at: new Date(now.getTime() + CODE_TTL_MS), created_at: now,
    });
    return code;
}

export async function resolvePrivateMatchCode(
    code: string
): Promise<{ hostId: string; wordLength: number | null } | null> {
    const r = await matchInvites().findOne({ code: code.toUpperCase() });
    if (!r) return null;
    if (r.expires_at.getTime() < Date.now()) return null;
    return { hostId: r.host_id, wordLength: r.word_length };
}

export async function consumePrivateMatchCode(code: string): Promise<void> {
    await matchInvites().deleteOne({ code: code.toUpperCase() });
}
