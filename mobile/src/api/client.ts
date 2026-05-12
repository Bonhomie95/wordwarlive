import * as SecureStore from 'expo-secure-store';

const API_URL =
    process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'wordwar.token';

export async function getStoredToken(): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
        return null;
    }
}

export async function setStoredToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

export class ApiError extends Error {
    public status: number;
    public payload: unknown;
    constructor(status: number, message: string, payload?: unknown) {
        super(message);
        this.status = status;
        this.payload = payload;
    }
}

interface RequestOpts {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    /** Override the default behavior of attaching the stored token. */
    auth?: boolean;
    headers?: Record<string, string>;
    /** Per-request timeout (ms). Defaults to 20s. */
    timeoutMs?: number;
    /** Number of retry attempts on network errors (not on 4xx/5xx). Default 2. */
    retries?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;

/**
 * Fetch wrapper with a timeout. Aborts the request after `timeoutMs` and
 * throws a clear error message instead of letting fetch hang forever.
 */
async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export async function apiRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(opts.headers ?? {}),
    };
    const useAuth = opts.auth ?? true;
    if (useAuth) {
        const tok = await getStoredToken();
        if (tok) headers.authorization = `Bearer ${tok}`;
    }

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retries = opts.retries ?? DEFAULT_RETRIES;
    const init: RequestInit = {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    };

    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetchWithTimeout(`${API_URL}${path}`, init, timeoutMs);
            const text = await res.text();
            let payload: unknown = null;
            try {
                payload = text ? JSON.parse(text) : null;
            } catch {
                // pass-through; not all responses are JSON
            }

            if (!res.ok) {
                const message =
                    (payload && typeof payload === 'object' && 'error' in payload
                        ? String((payload as { error: unknown }).error)
                        : null) ??
                    `Request failed (${res.status})`;
                // Don't retry application errors — only network/timeouts.
                throw new ApiError(res.status, message, payload);
            }
            return payload as T;
        } catch (err) {
            lastErr = err;
            // Do NOT retry application errors (4xx/5xx with a response).
            if (err instanceof ApiError) throw err;
            // Network or timeout error → exponential backoff, then retry.
            if (attempt < retries) {
                const backoff = Math.min(1000 * 2 ** attempt, 4000);
                await new Promise((r) => setTimeout(r, backoff));
                continue;
            }
        }
    }
    // Out of retries.
    if (lastErr instanceof Error) {
        const isAbort = lastErr.name === 'AbortError';
        throw new Error(
            isAbort
                ? 'Request timed out — check your connection.'
                : lastErr.message || 'Network error'
        );
    }
    throw new Error('Network error');
}

export const apiUrl = API_URL;
