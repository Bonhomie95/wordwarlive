// Online-presence tracker, backed by Redis so it works across a multi-node
// deployment: a socket connected to node A can be located (and, via the
// socket.io Redis adapter, messaged) from node B. Used for:
//   - Friend list "is online" badges
//   - Friend challenges / private match invites — find the target's live
//     socket regardless of which node it's on
//
// Two Redis hashes keep the mapping bidirectional so a disconnect can clean
// up by socket id:
//   presence:u2s   userId   -> socketId   (the user's CURRENT socket)
//   presence:s2u   socketId -> userId
//
// A tiny in-process cache mirrors u2s for hot synchronous-free reads within
// the same node; Redis remains the source of truth.

import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';

const U2S = 'presence:u2s';
const S2U = 'presence:s2u';

export async function markOnline(userId: string, socketId: string): Promise<void> {
    try {
        // If the user had a previous socket, drop its reverse mapping.
        const old = await redis.hget(U2S, userId);
        if (old && old !== socketId) await redis.hdel(S2U, old);
        await redis.hset(U2S, userId, socketId);
        await redis.hset(S2U, socketId, userId);
    } catch (err) {
        logger.warn({ err, userId }, 'presence markOnline failed');
    }
}

export async function markOffline(socketId: string): Promise<void> {
    try {
        const userId = await redis.hget(S2U, socketId);
        if (!userId) return;
        await redis.hdel(S2U, socketId);
        // Only clear the forward mapping if this socket is still the current
        // one (a fresh connection may have already replaced it).
        const cur = await redis.hget(U2S, userId);
        if (cur === socketId) await redis.hdel(U2S, userId);
    } catch (err) {
        logger.warn({ err, socketId }, 'presence markOffline failed');
    }
}

export async function socketIdFor(userId: string): Promise<string | null> {
    try {
        return (await redis.hget(U2S, userId)) ?? null;
    } catch (err) {
        logger.warn({ err, userId }, 'presence socketIdFor failed');
        return null;
    }
}

export async function isOnline(userId: string): Promise<boolean> {
    try {
        return (await redis.hexists(U2S, userId)) === 1;
    } catch {
        return false;
    }
}

/** Batch online check — one round trip for a list of user ids. */
export async function onlineMap(userIds: string[]): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    if (userIds.length === 0) return out;
    try {
        const vals = await redis.hmget(U2S, ...userIds);
        userIds.forEach((id, i) => {
            out[id] = vals[i] != null;
        });
    } catch {
        userIds.forEach((id) => (out[id] = false));
    }
    return out;
}
