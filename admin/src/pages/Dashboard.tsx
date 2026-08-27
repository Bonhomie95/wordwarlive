import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StatCard, Loading, ErrorNote } from '../components/ui';
import { num } from '../format';

interface Overview {
    players: {
        total: number;
        bots: number;
        banned: number;
        admins: number;
        premium: number;
        newToday: number;
        new7d: number;
        dau: number;
        wau: number;
        onlineNow: number;
    };
    matches: { total: number; today: number; last7d: number };
    economy: { totalCoins: number; iapTransactions: number };
    moderation: { openReports: number };
    season: { number: number; name: string } | null;
}

export default function Dashboard() {
    const [data, setData] = useState<Overview | null>(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        api.get<Overview>('/admin/overview').then(setData).catch((e) => setErr(e.message));
    }, []);

    if (err) return <ErrorNote error={err} />;
    if (!data) return <Loading />;

    const p = data.players;
    return (
        <>
            <div className="grid cols-4">
                <StatCard label="Total players" value={num(p.total)} sub={`${num(p.premium)} premium`} glow />
                <StatCard label="Online now" value={num(p.onlineNow)} sub="live sockets" />
                <StatCard label="Active today" value={num(p.dau)} sub={`${num(p.wau)} this week`} />
                <StatCard label="New today" value={num(p.newToday)} sub={`${num(p.new7d)} in 7 days`} />
            </div>

            <div className="grid cols-4" style={{ marginTop: 16 }}>
                <StatCard label="Matches played" value={num(data.matches.total)} sub={`${num(data.matches.today)} today · ${num(data.matches.last7d)} this week`} />
                <StatCard label="Coins in economy" value={num(data.economy.totalCoins)} sub={`${num(data.economy.iapTransactions)} purchases`} />
                <StatCard
                    label="Open reports"
                    value={num(data.moderation.openReports)}
                    sub={<Link to="/reports">Review queue →</Link>}
                />
                <StatCard label="Banned" value={num(p.banned)} sub={`${num(p.admins)} admins · ${num(p.bots)} bots`} />
            </div>

            <h2 className="section-title">At a glance</h2>
            <div className="grid cols-2">
                <div className="card">
                    <h3>Current season</h3>
                    {data.season ? (
                        <div style={{ fontSize: 18, fontWeight: 600 }}>
                            Season {data.season.number}
                            <div className="dim" style={{ fontSize: 14, fontWeight: 400, marginTop: 4 }}>
                                {data.season.name}
                            </div>
                        </div>
                    ) : (
                        <div className="muted">No active season.</div>
                    )}
                </div>
                <div className="card">
                    <h3>Quick actions</h3>
                    <div className="chip-row">
                        <Link className="chip" to="/players">Manage players</Link>
                        <Link className="chip" to="/players?filter=banned">Banned users</Link>
                        <Link className="chip" to="/reports">Moderation</Link>
                        <Link className="chip" to="/economy">Economy</Link>
                    </div>
                </div>
            </div>
        </>
    );
}
