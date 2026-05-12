// Apple id_token verification. apple-signin-auth pulls Apple's JWKS for us
// and validates aud (= our bundle id) and iss.

import appleSigninAuth from 'apple-signin-auth';
import { env } from '../config/env.js';

export interface AppleIdentity {
    sub: string;
    email: string | null;
}

export async function verifyAppleIdToken(idToken: string): Promise<AppleIdentity> {
    if (!env.APPLE_BUNDLE_ID) {
        throw new Error('APPLE_BUNDLE_ID not configured on the server.');
    }
    const payload = await appleSigninAuth.verifyIdToken(idToken, {
        audience: env.APPLE_BUNDLE_ID,
        ignoreExpiration: false,
    });
    if (!payload.sub) throw new Error('Apple id_token missing sub.');
    return {
        sub: payload.sub,
        // Apple only returns email on the first authorization; subsequent
        // logins may not include it. The DB row already has it from the
        // first time, so this is fine.
        email: payload.email ?? null,
    };
}
