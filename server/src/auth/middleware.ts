import type { Request, Response, NextFunction } from 'express';
import { verifySession, type SessionToken } from './jwt.js';
import { getTokenVersion } from '../services/userService.js';

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
        const current = await getTokenVersion(session.userId);
        if (current === null || current !== session.tokenVersion) {
            res.status(401).json({ error: 'Session expired. Please sign in again.' });
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
