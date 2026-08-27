// Thin fetch wrapper for the admin API. The bearer token lives in localStorage
// and is attached to every request. A 401/403 clears it and bounces to login.

const TOKEN_KEY = 'ww_admin_token';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) {
        // Session gone or not an admin — drop credentials so the guard redirects.
        if (path !== '/admin/login') {
            clearToken();
            if (!location.hash.includes('/login')) location.assign('/');
        }
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
        throw new ApiError(res.status, (data as { error?: string }).error || `HTTP ${res.status}`);
    }
    return data as T;
}

export const api = {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
};
