import { Router } from 'express';
import { z } from 'zod';
import {
    createUser,
    findUserByEmail,
    findUserById,
    findUserByProviderSubject,
    getPasswordHash,
    isValidUsername,
    type UserRow,
} from '../services/userService.js';
import { requireAuth } from '../auth/middleware.js';
import { query } from '../db/pool.js';
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
        const rows = await query<{ id: string }>(
            'SELECT id FROM users WHERE lower(username) = lower($1)',
            [candidate]
        );
        if (rows.length === 0) return candidate;
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

// ─── Account linking (anonymous → permanent) ────────────────────────────────
//
// A guest can upgrade to email / Google / Apple IN PLACE: the same users row
// keeps its id, username, rank, coins, cosmetics, and match history — only
// the auth columns change. After linking, the old device-id login stops
// resolving to this account (auth_subject changed), which is the point:
// the account is now protected by real credentials.

/** Load the session user and assert they're still an anonymous account. */
async function loadAnonymousUser(
    userId: string
): Promise<{ ok: true; user: UserRow } | { ok: false; status: number; error: string }> {
    const user = await findUserById(userId);
    if (!user) return { ok: false, status: 404, error: 'User not found' };
    if (user.auth_provider !== 'anonymous') {
        return {
            ok: false,
            status: 409,
            error: 'This account is already linked to a sign-in method.',
        };
    }
    return { ok: true, user };
}

const linkEmailSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
});

authRouter.post('/link/email', requireAuth, async (req, res) => {
    const parsed = linkEmailSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid body', details: parsed.error.issues });
    }
    const check = await loadAnonymousUser(req.session!.userId);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    const { email, password } = parsed.data;
    if (await findUserByEmail(email)) {
        return res.status(409).json({ error: 'Email already in use by another account.' });
    }

    const rows = await query<{ id: string }>(
        `UPDATE users SET
            auth_provider = 'email',
            auth_subject = lower($1),
            email = $1,
            password_hash = $2,
            updated_at = now()
         WHERE id = $3 AND auth_provider = 'anonymous'
         RETURNING id`,
        [email, await hashPassword(password), check.user.id]
    );
    if (rows.length === 0) {
        return res.status(409).json({ error: 'Account was already linked.' });
    }

    logger.info({ userId: check.user.id }, 'Anonymous account linked to email');
    const token = signSession({
        userId: check.user.id,
        username: check.user.username,
        provider: 'email',
    });
    const fresh = await findUserById(check.user.id);
    res.json({ token, user: shapeUserForClient(fresh!) });
});

authRouter.post('/link/google', requireAuth, async (req, res) => {
    const parsed = googleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const check = await loadAnonymousUser(req.session!.userId);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    let identity;
    try {
        identity = await verifyGoogleIdToken(parsed.data.idToken);
    } catch (err) {
        logger.warn({ err }, 'Google id_token verification failed (link)');
        return res.status(401).json({ error: 'Could not verify Google identity' });
    }
    if (await findUserByProviderSubject('google', identity.sub)) {
        return res.status(409).json({
            error: 'That Google account is already linked to another player.',
        });
    }

    const rows = await query<{ id: string }>(
        `UPDATE users SET
            auth_provider = 'google',
            auth_subject = $1,
            email = COALESCE($2, email),
            updated_at = now()
         WHERE id = $3 AND auth_provider = 'anonymous'
         RETURNING id`,
        [identity.sub, identity.email ?? null, check.user.id]
    );
    if (rows.length === 0) {
        return res.status(409).json({ error: 'Account was already linked.' });
    }

    logger.info({ userId: check.user.id }, 'Anonymous account linked to Google');
    const token = signSession({
        userId: check.user.id,
        username: check.user.username,
        provider: 'google',
    });
    const fresh = await findUserById(check.user.id);
    res.json({ token, user: shapeUserForClient(fresh!) });
});

authRouter.post('/link/apple', requireAuth, async (req, res) => {
    const parsed = appleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
    const check = await loadAnonymousUser(req.session!.userId);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    let identity;
    try {
        identity = await verifyAppleIdToken(parsed.data.idToken);
    } catch (err) {
        logger.warn({ err }, 'Apple id_token verification failed (link)');
        return res.status(401).json({ error: 'Could not verify Apple identity' });
    }
    if (await findUserByProviderSubject('apple', identity.sub)) {
        return res.status(409).json({
            error: 'That Apple ID is already linked to another player.',
        });
    }

    const rows = await query<{ id: string }>(
        `UPDATE users SET
            auth_provider = 'apple',
            auth_subject = $1,
            email = COALESCE($2, email),
            updated_at = now()
         WHERE id = $3 AND auth_provider = 'anonymous'
         RETURNING id`,
        [identity.sub, identity.email ?? null, check.user.id]
    );
    if (rows.length === 0) {
        return res.status(409).json({ error: 'Account was already linked.' });
    }

    logger.info({ userId: check.user.id }, 'Anonymous account linked to Apple');
    const token = signSession({
        userId: check.user.id,
        username: check.user.username,
        provider: 'apple',
    });
    const fresh = await findUserById(check.user.id);
    res.json({ token, user: shapeUserForClient(fresh!) });
});
