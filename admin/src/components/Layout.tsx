import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

const NAV = [
    { to: '/', label: 'Dashboard', icon: '◧', end: true },
    { to: '/players', label: 'Players', icon: '⚇' },
    { to: '/leaderboard', label: 'Leaderboard', icon: '♛' },
    { to: '/matches', label: 'Matches', icon: '⚔' },
    { to: '/reports', label: 'Reports', icon: '⚑' },
    { to: '/economy', label: 'Economy', icon: '◈' },
    { to: '/iap', label: 'Purchases', icon: '▤' },
    { to: '/audit', label: 'Audit log', icon: '❋' },
];

const TITLES: Record<string, string> = {
    '/': 'Dashboard',
    '/players': 'Players',
    '/leaderboard': 'Leaderboard',
    '/matches': 'Matches',
    '/reports': 'Reports',
    '/economy': 'Economy',
    '/iap': 'Purchases',
    '/audit': 'Audit log',
};

export default function Layout() {
    const { me, logout } = useAuth();
    const loc = useLocation();
    const title =
        TITLES[loc.pathname] ?? (loc.pathname.startsWith('/players/') ? 'Player detail' : 'Admin');

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">W</div>
                    <div>
                        <div className="brand-name">WordWar</div>
                        <div className="brand-sub">Admin</div>
                    </div>
                </div>
                <nav className="nav">
                    {NAV.map((n) => (
                        <NavLink key={n.to} to={n.to} end={n.end}>
                            <span className="nav-icon">{n.icon}</span>
                            {n.label}
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-foot">
                    Signed in as
                    <br />
                    <strong style={{ color: 'var(--text-dim)' }}>{me?.username}</strong>
                </div>
            </aside>
            <div className="main">
                <div className="topbar">
                    <h1>{title}</h1>
                    <button className="btn ghost sm" onClick={logout}>
                        Sign out
                    </button>
                </div>
                <div className="content">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
