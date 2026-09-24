// Apple id_token verification. apple-signin-auth pulls Apple's JWKS for us
// and validates aud (= our bundle id) and iss.

import appleSigninAuth from 'apple-signin-auth';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

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

function clientSecret(): string {
    return appleSigninAuth.getClientSecret({
        clientID: env.APPLE_BUNDLE_ID,
        teamID: env.APPLE_TEAM_ID,
        keyIdentifier: env.APPLE_KEY_ID,
        privateKey: env.applePrivateKey,
    });
}

/**
 * Exchange the one-time authorization code from the native sign-in sheet for
 * a refresh token. We only keep it so the account can be revoked with Apple
 * when the user deletes their account. Returns null (and logs) when the Apple
 * key isn't configured or Apple rejects the code — sign-in still succeeds.
 */
export async function exchangeAppleAuthCode(code: string): Promise<string | null> {
    if (!env.appleRevokeConfigured) {
        logger.warn('APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY not set — Apple token revocation on account deletion is disabled');
        return null;
    }
    try {
        // Native (bundle-id client) code exchange takes no redirect_uri.
        const r = (await appleSigninAuth.getAuthorizationToken(code, {
            clientID: env.APPLE_BUNDLE_ID,
            clientSecret: clientSecret(),
            redirectUri: '',
        })) as { refresh_token?: string; error?: string };
        if (!r.refresh_token) {
            logger.warn({ error: r.error }, 'Apple code exchange returned no refresh_token');
            return null;
        }
        return r.refresh_token;
    } catch (err) {
        logger.warn({ err }, 'Apple code exchange failed');
        return null;
    }
}

/** Revoke a stored Apple refresh token (account deletion). Best-effort. */
export async function revokeAppleRefreshToken(refreshToken: string): Promise<boolean> {
    if (!env.appleRevokeConfigured) return false;
    try {
        await appleSigninAuth.revokeAuthorizationToken(refreshToken, {
            clientID: env.APPLE_BUNDLE_ID,
            clientSecret: clientSecret(),
            tokenTypeHint: 'refresh_token',
        });
        return true;
    } catch (err) {
        logger.warn({ err }, 'Apple token revocation failed');
        return false;
    }
}
