// Expo push notifications.
//
// Devices register their Expo push token after auth; we deliver friend-
// challenge invites (and could add turn reminders) via Expo's push service so
// notifications reach players whose app is backgrounded or closed — something
// the live socket can't do on its own.
//
// Expo endpoint: https://docs.expo.dev/push-notifications/sending-notifications/

import { col, registerIndexes } from '../db/mongo.js';
import { logger } from '../utils/logger.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushTokenDoc {
    token: string;
    user_id: string;
    platform: 'ios' | 'android' | null;
    created_at: Date;
    updated_at: Date;
}

registerIndexes('push_tokens', [
    { key: { token: 1 }, unique: true },
    { key: { user_id: 1 } },
]);

const pushTokens = () => col<PushTokenDoc>('push_tokens');

export async function registerPushToken(args: {
    userId: string;
    token: string;
    platform?: 'ios' | 'android';
}): Promise<void> {
    // A token is globally unique to a device; re-point it at the current user
    // (handles a shared device where accounts switch).
    const now = new Date();
    await pushTokens().updateOne(
        { token: args.token },
        {
            $set: { user_id: args.userId, platform: args.platform ?? null, updated_at: now },
            $setOnInsert: { created_at: now },
        },
        { upsert: true }
    );
}

export async function removePushToken(token: string): Promise<void> {
    await pushTokens().deleteOne({ token });
}

async function tokensForUser(userId: string): Promise<string[]> {
    const rows = await pushTokens()
        .find({ user_id: userId }, { projection: { _id: 0, token: 1 } })
        .toArray();
    return rows.map((r) => r.token);
}

interface PushMessage {
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

/**
 * Send a push to every device registered to a user. Best-effort: failures are
 * logged, never thrown, so a push outage can't break gameplay. Invalid tokens
 * reported by Expo (DeviceNotRegistered) are pruned.
 */
export async function sendPushToUser(
    userId: string,
    msg: PushMessage
): Promise<void> {
    let tokens: string[];
    try {
        tokens = await tokensForUser(userId);
    } catch (err) {
        logger.warn({ err, userId }, 'push: failed to load tokens');
        return;
    }
    if (tokens.length === 0) return;

    const messages = tokens.map((to) => ({
        to,
        title: msg.title,
        body: msg.body,
        data: msg.data ?? {},
        sound: 'default' as const,
        priority: 'high' as const,
    }));

    try {
        const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
            },
            body: JSON.stringify(messages),
        });
        if (!res.ok) {
            logger.warn({ status: res.status, userId }, 'push: Expo returned non-200');
            return;
        }
        const body = (await res.json()) as {
            data?: { status: string; details?: { error?: string } }[];
        };
        // Prune tokens Expo says are dead.
        const dead: string[] = [];
        body.data?.forEach((r, i) => {
            if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
                dead.push(tokens[i]!);
            }
        });
        if (dead.length > 0) {
            await pushTokens().deleteMany({ token: { $in: dead } });
            logger.info({ count: dead.length }, 'push: pruned dead tokens');
        }
    } catch (err) {
        logger.warn({ err, userId }, 'push: send failed');
    }
}
