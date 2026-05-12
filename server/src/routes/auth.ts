import { Router } from 'express';
import { z } from 'zod';
import {
    createUser,
    findUserByEmail,
    findUserByProviderSubject,
    getPasswordHash,
    isValidUsername,
} from '../services/userService.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signSession } from '../auth/jwt.js';
import { verifyGoogleIdToken } from '../auth/google.js';
import { verifyAppleIdToken } from '../auth/apple.js';
import { logger } from '../utils/logger.js';

export const authRouter = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function shapeUserForClient(user: {
    id: string;
    username: string;
    auth_provider: 'anonymous' | 'email' | 'google' | 'apple';
    rank_points: number;
    rank_tier: string;
    wins: number;
    losses: number;
}) {
    return {
        id: user.id,
        username: user.username,
        provider: user.auth_provider,
        rankPoints: user.rank_points,
        rankTier: user.rank_tier,
        wins: user.wins,
        losses: user.losses,
    };
}

async function uniqueUsername(base: string): Promise<string> {
    // Try base, base1, base2, … until one is free. (For low-volume the
    // collision rate is small. For high volume we'd switch to a SQL UPSERT.)
    const clean = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) || 'player';
    for (let n = 0; n < 50; n++) {
        const candidate = n === 0 ? clean : `${clean}${n}`;
        if (!isValidUsername(candidate)) continue;
        const taken = await findUserByEmail(candidate); // username is unique, but emails are too
        // Actually we need a proper username check, not email. Let's use a direct query:
        const { query } = await import('../db/pool.js');
        const rows = await query<{ id: string }>(
            'SELECT id FROM users WHERE lower(username) = lower($1)',
            [candidate]
        );
        if (rows.length === 0 && !taken) return candidate;
    }
    // Fallback: random suffix
    return `${clean}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Anonymous ──────────────────────────────────────────────────────────────

const anonSchema = z.object({
    deviceId: z.string().min(8).max(128),
    desiredUsername: z.string().optional(),
});

authRouter.post('/anonymous', async (req, res) => {
    const parsed = anonSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    }
    const { deviceId, desiredUsername } = parsed.data;

    let user = await findUserByProviderSubject('anonymous', deviceId);
    if (!user) {
        const username = await uniqueUsername(desiredUsername ?? `player_${deviceId.slice(0, 6)}`);
        if (!isValidUsername(username)) {
            return res.status(400).json({ error: 'Could not derive a valid username' });
        }
        user = await createUser({
            username,
            provider: 'anonymous',
            subject: deviceId,
        });
        logger.info({ userId: user.id }, 'Created anonymous user');
    }
    const token = signSession({
        userId: user.id,
        username: user.username,
        provider: 'anonymous',
    });
    res.json({ token, user: shapeUserForClient(user) });
});

// ─── Email register ─────────────────────────────────────────────────────────

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    username: z.string().min(3).max(16),
});

authRouter.post('/email/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    }
    const { email, password, username } = parsed.data;

    if (!isValidUsername(username)) {
        return res.status(400).json({ error: 'Username must be 3–16 chars, letters/numbers/underscores only' });
    }
    if (await findUserByEmail(email)) {
        return res.status(409).json({ error: 'Email already in use' });
    }
    const { query } = await import('../db/pool.js');
    const exists = await query('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
    if (exists.length > 0) {
        return res.status(409).json({ error: 'Username taken' });
    }

    const user = await createUser({
        username,
        provider: 'email',
        subject: email.toLowerCase(),
        email,
        passwordHash: await hashPassword(password),
    });
    const token = signSession({
        userId: user.id,
        username: user.username,
        provider: 'email',
    });
    res.json({ token, user: shapeUserForClient(user) });
});

// ─── Email login ────────────────────────────────────────────────────────────

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

authRouter.post('/email/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid body' });
    }
    const { email, password } = parsed.data;

    const user = await findUserByEmail(email);
    if (!user || user.auth_provider !== 'email') {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    const hash = await getPasswordHash(user.id);
    if (!hash || !(await verifyPassword(password, hash))) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signSession({
        userId: user.id,
        username: user.username,
        provider: 'email',
    });
    res.json({ token, user: shapeUserForClient(user) });
});

// ─── Google ─────────────────────────────────────────────────────────────────

const googleSchema = z.object({ idToken: z.string().min(1) });

authRouter.post('/google', async (req, res) => {
    const parsed = googleSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid body' });
    }
    let identity;
    try {
        identity = await verifyGoogleIdToken(parsed.data.idToken);
    } catch (err) {
        logger.warn({ err }, 'Google id_token verification failed');
        return res.status(401).json({ error: 'Could not verify Google identity' });
    }
    let user = await findUserByProviderSubject('google', identity.sub);
    if (!user) {
        const username = await uniqueUsername(identity.suggestedName ?? 'player');
        user = await createUser({
            username,
            provider: 'google',
            subject: identity.sub,
            email: identity.email,
        });
    }
    const token = signSession({
        userId: user.id,
        username: user.username,
        provider: 'google',
    });
    res.json({ token, user: shapeUserForClient(user) });
});

// ─── Apple ──────────────────────────────────────────────────────────────────

const appleSchema = z.object({ idToken: z.string().min(1) });

authRouter.post('/apple', async (req, res) => {
    const parsed = appleSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid body' });
    }
    let identity;
    try {
        identity = await verifyAppleIdToken(parsed.data.idToken);
    } catch (err) {
        logger.warn({ err }, 'Apple id_token verification failed');
        return res.status(401).json({ error: 'Could not verify Apple identity' });
    }
    let user = await findUserByProviderSubject('apple', identity.sub);
    if (!user) {
        const username = await uniqueUsername('apple_player');
        user = await createUser({
            username,
            provider: 'apple',
            subject: identity.sub,
            email: identity.email,
        });
    }
    const token = signSession({
        userId: user.id,
        username: user.username,
        provider: 'apple',
    });
    res.json({ token, user: shapeUserForClient(user) });
});
