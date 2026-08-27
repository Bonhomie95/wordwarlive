import type { Request, Response, NextFunction } from 'express';
import { verifySession, type SessionToken } from './jwt.js';
import { getSessionState } from '../services/userService.js';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            session?: SessionToken;
        }
    }
}

/**
 * Require a valid, non-revoked session.
 *
 * Beyond the JWT signature check, we compare the token's `tv` (token version)
 * against the user's current `token_version` in the DB. Bumping that column
 * ("log out everywhere") invalidates every previously-issued token. This is
 * one indexed primary-key lookup per authenticated HTTP request; the realtime
 * hot path (guesses) runs over the socket, not HTTP, so the cost is modest.
 */
export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const header = req.header('authorization') ?? '';
    const match = header.match(/^Bearer (.+)$/i);
    if (!match) {
        res.status(401).json({ error: 'Missing bearer token' });
        return;
    }
    let session: SessionToken;
    try {
        session = verifySession(match[1]!);
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }
    try {
        const state = await getSessionState(session.userId);
        if (state === null || state.tokenVersion !== session.tokenVersion) {
            res.status(401).json({ error: 'Session expired. Please sign in again.' });
            return;
        }
        if (state.banned) {
            res.status(403).json({ error: 'This account has been suspended.' });
            return;
        }
    } catch {
        // DB hiccup — fail closed on auth to avoid accepting a possibly-revoked
        // token during an outage.
        res.status(503).json({ error: 'Auth temporarily unavailable' });
        return;
    }
    req.session = session;
    next();
}

/** Gate for the admin surface. MUST be mounted AFTER requireAuth (it reads
 *  req.session). Rejects any non-admin with 403. */
export async function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const userId = req.session?.userId;
    if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    try {
        const { isAdmin } = await import('../services/adminService.js');
        if (!(await isAdmin(userId))) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
    } catch {
        res.status(503).json({ error: 'Admin check unavailable' });
        return;
    }
    next();
}

/** Optional auth — populates req.session if present, doesn't fail if not.
 *  Does NOT perform the revocation DB check (used only for public endpoints
 *  that lightly personalize output). */
export function optionalAuth(
    req: Request,
    _res: Response,
    next: NextFunction
): void {
    const header = req.header('authorization') ?? '';
    const match = header.match(/^Bearer (.+)$/i);
    if (match) {
        try {
            req.session = verifySession(match[1]!);
        } catch {
            // ignore
        }
    }
    next();
}
