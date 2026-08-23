// Expo push notifications.
//
// Devices register their Expo push token after auth; we deliver friend-
// challenge invites (and could add turn reminders) via Expo's push service so
// notifications reach players whose app is backgrounded or closed — something
// the live socket can't do on its own.
//
// Expo endpoint: https://docs.expo.dev/push-notifications/sending-notifications/

import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function registerPushToken(args: {
    userId: string;
    token: string;
    platform?: 'ios' | 'android';
}): Promise<void> {
    // A token is globally unique to a device; re-point it at the current user
    // (handles a shared device where accounts switch).
    await query(
        `INSERT INTO push_tokens (token, user_id, platform, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             updated_at = now()`,
        [args.token, args.userId, args.platform ?? null]
    );
}

export async function removePushToken(token: string): Promise<void> {
    await query('DELETE FROM push_tokens WHERE token = $1', [token]);
}

async function tokensForUser(userId: string): Promise<string[]> {
    const rows = await query<{ token: string }>(
        'SELECT token FROM push_tokens WHERE user_id = $1',
        [userId]
    );
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
            await query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [dead]);
            logger.info({ count: dead.length }, 'push: pruned dead tokens');
        }
    } catch (err) {
        logger.warn({ err, userId }, 'push: send failed');
    }
}
