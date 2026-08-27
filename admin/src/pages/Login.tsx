import { useState } from 'react';
import { useAuth } from '../auth';

export default function Login() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr('');
        setBusy(true);
        try {
            await login(email.trim(), password);
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Login failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="center-screen">
            <form className="login-card" onSubmit={submit}>
                <div className="brand">
                    <div className="brand-mark">W</div>
                    <div>
                        <div className="brand-name">WordWar</div>
                        <div className="brand-sub">Admin</div>
                    </div>
                </div>
                <div className="field">
                    <label>Email</label>
                    <input
                        className="input"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@wordwar.app"
                        autoFocus
                    />
                </div>
                <div className="field">
                    <label>Password</label>
                    <input
                        className="input"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                    />
                </div>
                <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                </button>
                <div className="login-err">{err}</div>
            </form>
        </div>
    );
}
