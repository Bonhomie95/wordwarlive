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
