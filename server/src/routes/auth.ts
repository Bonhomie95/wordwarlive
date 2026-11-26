import { env } from '../config/env.js';
import { Router } from 'express';
import { z } from 'zod';
import {
    CI,
    bumpTokenVersion,
    createUser,
    findUserByEmail,
    findUserById,
    findUserByProviderSubject,
    findUserIdByUsername,
    getPasswordHash,
    isValidUsername,
    setAppleRefreshToken,
    type UserRow,
} from '../services/userService.js';
import { requireAuth } from '../auth/middleware.js';
import { containsProfanity } from '../moderation/blocklist.js';
import { col } from '../db/mongo.js';
import { redis } from '../db/redis.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signSession } from '../auth/jwt.js';
import { verifyGoogleIdToken } from '../auth/google.js';
import { exchangeAppleAuthCode, verifyAppleIdToken } from '../auth/apple.js';
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
    // First free name among base, base1 … base49, checked in ONE query.
    const clean = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) || 'player';
    const candidates = [clean, ...Array.from({ length: 49 }, (_, i) => `${clean}${i + 1}`)].filter(isValidUsername);
    const taken = await col<{ username: string }>('users')
        .find({ username: { $in: candidates } }, { projection: { _id: 0, username: 1 }, collation: CI })
        .toArray();
    const takenLower = new Set(taken.map((u) => u.username.toLowerCase()));
    // Fallback: random suffix
    return candidates.find((c) => !takenLower.has(c.toLowerCase())) ?? `${clean}${Math.random().toString(36).slice(2, 6)}`;
}

// ponytail: per-IP cap on NEW guest/email accounts (returning sign-ins don't
// count; Google/Apple need a real identity). Generous because carrier NAT
// shares one IP across many phones; add device attestation if farms appear.
const NEW_ACCOUNTS_PER_IP_HOUR = 30;
async function newAccountAllowed(ip: string | undefined): Promise<boolean> {
    const key = `signups:${ip ?? 'unknown'}:${Math.floor(Date.now() / 3_600_000)}`;
    try {
        const n = await redis.incr(key);
        if (n === 1) await redis.expire(key, 3_700);
        return n <= NEW_ACCOUNTS_PER_IP_HOUR;
    } catch {
        return true; // a Redis hiccup must not block sign-up
    }
}
const TOO_MANY_ACCOUNTS = { error: 'Too many new accounts from this network. Please try again later.' };

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
    if (desiredUsername && containsProfanity(desiredUsername)) {
        return res.status(400).json({ error: 'That username contains blocked content.' });
    }

    let user = await findUserByProviderSubject('anonymous', deviceId);
    if (!user) {
        if (!(await newAccountAllowed(req.ip))) return res.status(429).json(TOO_MANY_ACCOUNTS);
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
        tokenVersion: user.token_version,
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
    if (containsProfanity(username)) {
        return res.status(400).json({ error: 'That username contains blocked content.' });
    }
    if (await findUserByEmail(email)) {
        return res.status(409).json({ error: 'Email already in use' });
    }
    if (await findUserIdByUsername(username)) {
        return res.status(409).json({ error: 'Username taken' });
    }
    if (!(await newAccountAllowed(req.ip))) return res.status(429).json(TOO_MANY_ACCOUNTS);

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
        tokenVersion: user.token_version,
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
        tokenVersion: user.token_version,
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
        return res.status(400).json({ error: 'Could not verify Google identity' });
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
        tokenVersion: user.token_version,
        provider: 'google',
    });
    res.json({ token, user: shapeUserForClient(user) });
});

// ─── Apple ──────────────────────────────────────────────────────────────────

const appleSchema = z.object({
    idToken: z.string().min(1),
    // One-time code from the native sheet; exchanged for a refresh token so we
    // can revoke the sign-in when the account is deleted. Optional so older
    // clients keep working.
    authorizationCode: z.string().min(1).max(2048).optional(),
});

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
        return res.status(400).json({ error: 'Could not verify Apple identity' });
    }
    const appleRefresh = parsed.data.authorizationCode
        ? await exchangeAppleAuthCode(parsed.data.authorizationCode) : null;
    if (env.NODE_ENV === 'production' && !appleRefresh) {
        return res.status(503).json({ error: 'Apple sign-in could not finish. Please retry so account deletion can be supported.' });
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
    if (appleRefresh) await setAppleRefreshToken(user.id, appleRefresh);
    const token = signSession({
        userId: user.id,
        username: user.username,
        tokenVersion: user.token_version,
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

    const upd = await col('users').updateOne(
        { id: check.user.id, auth_provider: 'anonymous' },
        {
            $set: {
                auth_provider: 'email',
                auth_subject: email.toLowerCase(),
                email,
                password_hash: await hashPassword(password),
                updated_at: new Date(),
            },
        }
    );
    if (upd.matchedCount === 0) {
        return res.status(409).json({ error: 'Account was already linked.' });
    }

    logger.info({ userId: check.user.id }, 'Anonymous account linked to email');
    const token = signSession({
        userId: check.user.id,
        username: check.user.username,
        tokenVersion: check.user.token_version,
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
        return res.status(400).json({ error: 'Could not verify Google identity' });
    }
    if (await findUserByProviderSubject('google', identity.sub)) {
        return res.status(409).json({
            error: 'That Google account is already linked to another player.',
        });
    }

    const upd = await col('users').updateOne(
        { id: check.user.id, auth_provider: 'anonymous' },
        {
            $set: {
                auth_provider: 'google',
                auth_subject: identity.sub,
                ...(identity.email ? { email: identity.email } : {}), // COALESCE($2, email)
                updated_at: new Date(),
            },
        }
    );
    if (upd.matchedCount === 0) {
        return res.status(409).json({ error: 'Account was already linked.' });
    }

    logger.info({ userId: check.user.id }, 'Anonymous account linked to Google');
    const token = signSession({
        userId: check.user.id,
        username: check.user.username,
        tokenVersion: check.user.token_version,
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
        return res.status(400).json({ error: 'Could not verify Apple identity' });
    }
    if (await findUserByProviderSubject('apple', identity.sub)) {
        return res.status(409).json({
            error: 'That Apple ID is already linked to another player.',
        });
    }

    const appleRefresh = parsed.data.authorizationCode
        ? await exchangeAppleAuthCode(parsed.data.authorizationCode) : null;
    if (env.NODE_ENV === 'production' && !appleRefresh) {
        return res.status(503).json({ error: 'Apple sign-in could not finish. Please retry so account deletion can be supported.' });
    }
    const upd = await col('users').updateOne(
        { id: check.user.id, auth_provider: 'anonymous' },
        {
            $set: {
                auth_provider: 'apple',
                auth_subject: identity.sub,
                ...(identity.email ? { email: identity.email } : {}), // COALESCE($2, email)
                updated_at: new Date(),
            },
        }
    );
    if (upd.matchedCount === 0) {
        return res.status(409).json({ error: 'Account was already linked.' });
    }

    if (appleRefresh) await setAppleRefreshToken(check.user.id, appleRefresh);
    logger.info({ userId: check.user.id }, 'Anonymous account linked to Apple');
    const token = signSession({
        userId: check.user.id,
        username: check.user.username,
        tokenVersion: check.user.token_version,
        provider: 'apple',
    });
    const fresh = await findUserById(check.user.id);
    res.json({ token, user: shapeUserForClient(fresh!) });
});

// ─── Log out everywhere ───────────────────────────────────────────────────
//
// Bumps the user's token_version, immediately invalidating every previously
// issued JWT (this device included), then returns a fresh token so the caller
// can stay signed in on THIS device if it wants. Used from Settings and as a
// remediation lever if a token is believed compromised.
authRouter.post('/logout-all', requireAuth, async (req, res) => {
    const userId = req.session!.userId;
    const newVersion = await bumpTokenVersion(userId);
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const token = signSession({
        userId: user.id,
        username: user.username,
        tokenVersion: newVersion,
        provider: user.auth_provider,
    });
    res.json({ token, user: shapeUserForClient(user) });
});

// ─── Session refresh ──────────────────────────────────────────────────────
//
// A token lives JWT_EXPIRES_IN from issue. The app trades it for a fresh one
// on every launch, so a player who keeps playing is never signed out; an
// unused session still runs out, and token_version still revokes it.
authRouter.post('/refresh', requireAuth, async (req, res) => {
    const user = await findUserById(req.session!.userId);
    if (!user) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    const token = signSession({
        userId: user.id,
        username: user.username,
        tokenVersion: user.token_version,
        provider: user.auth_provider,
    });
    res.json({ token });
});
