import { create } from "zustand";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ApiError,
  clearStoredToken,
  setStoredToken,
  getStoredToken,
  setUnauthorizedHandler,
} from "../api/client";
import {
  loginAnonymous,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  loginWithApple,
  linkEmail,
  linkGoogle,
  linkApple,
} from "../api/auth";
import { usersApi } from "../api/resources";
import type { MeResponse, PublicUser } from "../types/index";
import { disconnectSocket } from "../socket/client";
import { unregisterPush } from "../lib/notifications";

const DEVICE_KEY = "wordwar.deviceId";
/** Last-known profile, cached so cold starts render instantly (and offline)
 *  instead of blanking until /me responds. Not secret → AsyncStorage. */
const USER_CACHE_KEY = "wordwar.userCache";

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_KEY);
  if (existing) return existing;
  const fresh = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_KEY, fresh);
  return fresh;
}

function cacheUser(user: PublicUser | MeResponse | null): void {
  if (user) {
    AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user)).catch(() => {});
  } else {
    AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
  }
}

async function readCachedUser(): Promise<PublicUser | MeResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PublicUser | MeResponse) : null;
  } catch {
    return null;
  }
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
  registerEmail: (
    email: string,
    password: string,
    username: string,
  ) => Promise<void>;
  signInGoogle: (idToken: string) => Promise<void>;
  signInApple: (idToken: string) => Promise<void>;
  refreshMe: () => Promise<void>;

  /** Upgrade the current ANONYMOUS account in place — same user row, same
   *  rank/coins/history — protected by real credentials afterwards. */
  linkEmail: (email: string, password: string) => Promise<void>;
  linkGoogle: (idToken: string) => Promise<void>;
  linkApple: (idToken: string) => Promise<void>;

  /** Adopt a freshly-rotated token for THIS device (e.g. after
   *  "log out everywhere"). Persists it, tears down the old socket so the
   *  next connect uses the new token, and updates state. */
  applyRotatedToken: (token: string) => Promise<void>;

  signOut: () => Promise<void>;
}

async function persistAndApply(
  token: string,
  user: PublicUser,
  setter: (s: Partial<AuthState>) => void,
) {
  await setStoredToken(token);
  cacheUser(user);
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
      // Trust the cached token + profile IMMEDIATELY so the app renders
      // without waiting on the network — blocking here meant an unreachable
      // server (wrong LAN IP, no Wi-Fi) held the splash spinner for 60s+.
      const cachedUser = await readCachedUser();
      set({ token, user: cachedUser, hydrated: true });
      // Validate in the background. Only an explicit auth rejection clears
      // the session; a network failure keeps the cached session so the app
      // still works offline and recovers when connectivity returns.
      try {
        const me = await usersApi.me();
        cacheUser(me);
        set({ user: me });
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          await clearStoredToken();
          cacheUser(null);
          set({ token: null, user: null });
        }
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
      set({
        busy: false,
        error: err instanceof Error ? err.message : "Sign-in failed",
      });
      throw err;
    }
  },

  signInEmail: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const r = await loginWithEmail({ email, password });
      await persistAndApply(r.token, r.user, set);
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : "Sign-in failed",
      });
      throw err;
    }
  },

  registerEmail: async (email, password, username) => {
    set({ busy: true, error: null });
    try {
      const r = await registerWithEmail({ email, password, username });
      await persistAndApply(r.token, r.user, set);
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : "Registration failed",
      });
      throw err;
    }
  },

  signInGoogle: async (idToken) => {
    set({ busy: true, error: null });
    try {
      const r = await loginWithGoogle(idToken);
      await persistAndApply(r.token, r.user, set);
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : "Google sign-in failed",
      });
      throw err;
    }
  },

  signInApple: async (idToken) => {
    set({ busy: true, error: null });
    try {
      const r = await loginWithApple(idToken);
      await persistAndApply(r.token, r.user, set);
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : "Apple sign-in failed",
      });
      throw err;
    }
  },

  linkEmail: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const r = await linkEmail({ email, password });
      await persistAndApply(r.token, r.user, set);
      // Pull the full MeResponse (coins, cosmetics…) for the linked account.
      get().refreshMe().catch(() => {});
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : "Linking failed",
      });
      throw err;
    }
  },

  linkGoogle: async (idToken) => {
    set({ busy: true, error: null });
    try {
      const r = await linkGoogle(idToken);
      await persistAndApply(r.token, r.user, set);
      get().refreshMe().catch(() => {});
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : "Linking failed",
      });
      throw err;
    }
  },

  linkApple: async (idToken) => {
    set({ busy: true, error: null });
    try {
      const r = await linkApple(idToken);
      await persistAndApply(r.token, r.user, set);
      get().refreshMe().catch(() => {});
    } catch (err) {
      set({
        busy: false,
        error: err instanceof Error ? err.message : "Linking failed",
      });
      throw err;
    }
  },

  refreshMe: async () => {
    if (!get().token) return;
    try {
      const me = await usersApi.me();
      cacheUser(me);
      set({ user: me });
    } catch {
      // ignore — keep the cached user
    }
  },

  applyRotatedToken: async (token) => {
    await setStoredToken(token);
    // The persistent socket was opened with the OLD token; its handshake
    // already passed, but the bumped token_version would reject it on the
    // next reconnect. Tear it down so _layout re-opens a fresh socket with
    // the new token (ensureSocket reuses an existing socket, so we must
    // disconnect first). Setting `token` re-triggers that effect.
    disconnectSocket();
    set({ token });
  },

  signOut: async () => {
    // Best-effort: drop this device's push token before we lose the session.
    await unregisterPush().catch(() => {});
    await clearStoredToken();
    cacheUser(null);
    disconnectSocket();
    set({ token: null, user: null, error: null, hydrated: true });
  },
}));

// Any authenticated request that 401s (expired/invalidated session) signs the
// user out globally. Only fires if we're actually signed in, so a bad-password
// 401 on the login endpoint won't trigger it.
setUnauthorizedHandler(() => {
  if (useAuthStore.getState().token) {
    void useAuthStore.getState().signOut();
  }
});
