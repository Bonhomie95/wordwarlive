import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface SessionToken {
    userId: string;
    username: string;
    /** Auth provider used to log in. */
    provider: 'anonymous' | 'email' | 'google' | 'apple';
}

export function signSession(payload: SessionToken): string {
    const opts: SignOptions = {
        expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };
    return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifySession(token: string): SessionToken {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload &
        SessionToken;
    if (!decoded.userId || !decoded.username || !decoded.provider) {
        throw new Error('Malformed session token');
    }
    return {
        userId: decoded.userId,
        username: decoded.username,
        provider: decoded.provider,
    };
}
