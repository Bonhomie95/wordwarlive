import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
    clearStoredToken,
    setStoredToken,
    getStoredToken,
} from '../api/client';
import {
    loginAnonymous,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    loginWithApple,
} from '../api/auth';
import { usersApi } from '../api/resources';
import type { MeResponse, PublicUser } from '../types/index';
import { disconnectSocket } from '../socket/client';

const DEVICE_KEY = 'wordwar.deviceId';

async function getOrCreateDeviceId(): Promise<string> {
    const existing = await SecureStore.getItemAsync(DEVICE_KEY);
    if (existing) return existing;
    const fresh = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, fresh);
    return fresh;
}

interface AuthState {
    /** Initial bootstrap finished (token loaded from storage if any). */
    hydrated: boolean;
    token: string | null;
    user: PublicUser | MeResponse | null;
    /** True when an auth call is in-flight. */
    busy: boolean;
    error: string | null;

    hydrate: () => Promise<void>;

    signInAnonymous: (desiredUsername?: string) => Promise<void>;
    signInEmail: (email: string, password: string) => Promise<void>;
    registerEmail: (email: string, password: string, username: string) => Promise<void>;
    signInGoogle: (idToken: string) => Promise<void>;
    signInApple: (idToken: string) => Promise<void>;
    refreshMe: () => Promise<void>;

    signOut: () => Promise<void>;
}

async function persistAndApply(token: string, user: PublicUser, setter: (s: Partial<AuthState>) => void) {
    await setStoredToken(token);
    setter({ token, user, error: null, busy: false });
}

export const useAuthStore = create<AuthState>((set, get) => ({
    hydrated: false,
    token: null,
    user: null,
    busy: false,
    error: null,

    hydrate: async () => {
        try {
            const token = await getStoredToken();
            if (!token) {
                set({ hydrated: true });
                return;
            }
            // Try to fetch /me with the existing token. If that fails (expired,
            // revoked) clear it and bounce back to the welcome screen.
            try {
                const me = await usersApi.me();
                set({ token, user: me, hydrated: true });
            } catch {
                await clearStoredToken();
                set({ token: null, user: null, hydrated: true });
            }
        } catch {
            set({ hydrated: true });
        }
    },

    signInAnonymous: async (desiredUsername) => {
        set({ busy: true, error: null });
        try {
            const deviceId = await getOrCreateDeviceId();
            const r = await loginAnonymous({ deviceId, desiredUsername });
            await persistAndApply(r.token, r.user, set);
        } catch (err) {
            set({ busy: false, error: err instanceof Error ? err.message : 'Sign-in failed' });
            throw err;
        }
    },

    signInEmail: async (email, password) => {
        set({ busy: true, error: null });
        try {
            const r = await loginWithEmail({ email, password });
            await persistAndApply(r.token, r.user, set);
        } catch (err) {
            set({ busy: false, error: err instanceof Error ? err.message : 'Sign-in failed' });
            throw err;
        }
    },

    registerEmail: async (email, password, username) => {
        set({ busy: true, error: null });
        try {
            const r = await registerWithEmail({ email, password, username });
            await persistAndApply(r.token, r.user, set);
        } catch (err) {
            set({ busy: false, error: err instanceof Error ? err.message : 'Registration failed' });
            throw err;
        }
    },

    signInGoogle: async (idToken) => {
        set({ busy: true, error: null });
        try {
            const r = await loginWithGoogle(idToken);
            await persistAndApply(r.token, r.user, set);
        } catch (err) {
            set({ busy: false, error: err instanceof Error ? err.message : 'Google sign-in failed' });
            throw err;
        }
    },

    signInApple: async (idToken) => {
        set({ busy: true, error: null });
        try {
            const r = await loginWithApple(idToken);
            await persistAndApply(r.token, r.user, set);
        } catch (err) {
            set({ busy: false, error: err instanceof Error ? err.message : 'Apple sign-in failed' });
            throw err;
        }
    },

    refreshMe: async () => {
        if (!get().token) return;
        try {
            const me = await usersApi.me();
            set({ user: me });
        } catch {
            // ignore — keep the cached user
        }
    },

    signOut: async () => {
        await clearStoredToken();
        disconnectSocket();
        set({ token: null, user: null, error: null });
    },
}));
