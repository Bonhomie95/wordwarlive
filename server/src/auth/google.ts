// We accept Google id_tokens from any of the configured client IDs (web,
// iOS, Android — they all hit the same backend). google-auth-library handles
// the cert rotation and signature checks for us.

import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';

const client = new OAuth2Client();

export interface GoogleIdentity {
    sub: string;
    email: string | null;
    /** Provided so we can prefill a username if the user is new. */
    suggestedName: string | null;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
    if (env.googleClientIds.length === 0) {
        throw new Error('GOOGLE_CLIENT_IDS not configured on the server.');
    }
    const ticket = await client.verifyIdToken({
        idToken,
        audience: env.googleClientIds,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new Error('Google id_token missing sub.');
    return {
        sub: payload.sub,
        email: payload.email ?? null,
        suggestedName: payload.given_name ?? payload.name ?? null,
    };
}
