import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface SessionToken {
    userId: string;
    username: string;
    /** Auth provider used to log in. */
    provider: 'anonymous' | 'email' | 'google' | 'apple';
    /** Token version at issue time. Compared against users.token_version to
     *  support "log out everywhere" / forced revocation. Older tokens without
     *  the claim default to 0. */
    tokenVersion: number;
}

export function signSession(payload: SessionToken): string {
    const opts: SignOptions = {
        expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };
    // Persist as the short `tv` claim to keep tokens compact.
    return jwt.sign(
        {
            userId: payload.userId,
            username: payload.username,
            provider: payload.provider,
            tv: payload.tokenVersion,
        },
        env.JWT_SECRET,
        opts
    );
}

export function verifySession(token: string): SessionToken {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload &
        SessionToken & { tv?: number };
    if (!decoded.userId || !decoded.username || !decoded.provider) {
        throw new Error('Malformed session token');
    }
    return {
        userId: decoded.userId,
        username: decoded.username,
        provider: decoded.provider,
        tokenVersion: typeof decoded.tv === 'number' ? decoded.tv : 0,
    };
}
