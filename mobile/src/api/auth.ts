import { apiRequest } from './client';
import type { AuthResponse } from '../types/index';

export function loginAnonymous(args: {
    deviceId: string;
    desiredUsername?: string;
}) {
    return apiRequest<AuthResponse>('/api/auth/anonymous', {
        method: 'POST',
        body: args,
        auth: false,
    });
}

export function registerWithEmail(args: {
    email: string;
    password: string;
    username: string;
}) {
    return apiRequest<AuthResponse>('/api/auth/email/register', {
        method: 'POST',
        body: args,
        auth: false,
    });
}

export function loginWithEmail(args: { email: string; password: string }) {
    return apiRequest<AuthResponse>('/api/auth/email/login', {
        method: 'POST',
        body: args,
        auth: false,
    });
}

export function loginWithGoogle(idToken: string) {
    return apiRequest<AuthResponse>('/api/auth/google', {
        method: 'POST',
        body: { idToken },
        auth: false,
    });
}

export function loginWithApple(idToken: string) {
    return apiRequest<AuthResponse>('/api/auth/apple', {
        method: 'POST',
        body: { idToken },
        auth: false,
    });
}

// ─── Account linking (guest → permanent) ────────────────────────────────────
//
// These run AUTHENTICATED as the current anonymous session. The server
// upgrades the same users row in place (id, username, rank, coins, match
// history all preserved) and returns a fresh token for the new provider.

export function linkEmail(args: { email: string; password: string }) {
    return apiRequest<AuthResponse>('/api/auth/link/email', {
        method: 'POST',
        body: args,
    });
}

export function linkGoogle(idToken: string) {
    return apiRequest<AuthResponse>('/api/auth/link/google', {
        method: 'POST',
        body: { idToken },
    });
}

export function linkApple(idToken: string) {
    return apiRequest<AuthResponse>('/api/auth/link/apple', {
        method: 'POST',
        body: { idToken },
    });
}
