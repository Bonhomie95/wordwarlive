import type { Request, Response, NextFunction } from 'express';
import { verifySession, type SessionToken } from './jwt.js';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            session?: SessionToken;
        }
    }
}

export function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const header = req.header('authorization') ?? '';
    const match = header.match(/^Bearer (.+)$/i);
    if (!match) {
        res.status(401).json({ error: 'Missing bearer token' });
        return;
    }
    try {
        req.session = verifySession(match[1]!);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/** Optional auth — populates req.session if present, doesn't fail if not. */
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
