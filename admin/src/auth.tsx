import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, clearToken } from './api';

interface AdminMe {
    id: string;
    username: string;
}
interface AuthState {
    me: AdminMe | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [me, setMe] = useState<AdminMe | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // On boot, if we have a token, verify it's still a valid admin session.
        if (!getToken()) {
            setLoading(false);
            return;
        }
        api
            .get<AdminMe>('/admin/me')
            .then(setMe)
            .catch(() => clearToken())
            .finally(() => setLoading(false));
    }, []);

    async function login(email: string, password: string) {
        const res = await api.post<{ token: string; admin: AdminMe }>('/admin/login', {
            email,
            password,
        });
        setToken(res.token);
        setMe({ id: res.admin.id, username: res.admin.username });
    }

    function logout() {
        clearToken();
        setMe(null);
    }

    return <Ctx.Provider value={{ me, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
    return useContext(Ctx);
}
