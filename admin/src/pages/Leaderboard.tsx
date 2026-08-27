import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Loading, ErrorNote } from '../components/ui';
import { num, winPct, tierBadgeClass } from '../format';

interface Row {
    position: string; id: string; username: string; rank_points: number; rank_tier: string;
    wins: number; losses: number; play_streak: number; play_streak_best: number;
}

export default function Leaderboard() {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        api.get<Row[]>('/admin/leaderboard?limit=100').then(setRows).catch((e) => setErr(e.message));
    }, []);
    if (err) return <ErrorNote error={err} />;
    if (!rows) return <Loading />;
    return (
        <>
            <p className="muted" style={{ marginTop: 0 }}>Top 100 by rank points (bots excluded).</p>
            <div className="table-wrap">
                <table>
                    <thead>
                        <tr><th>#</th><th>Player</th><th style={{ textAlign: 'right' }}>Rank pts</th><th>Tier</th><th style={{ textAlign: 'right' }}>W / L</th><th style={{ textAlign: 'right' }}>Win %</th><th style={{ textAlign: 'right' }}>Streak</th><th style={{ textAlign: 'right' }}>Best</th></tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id}>
                                <td className="mono" style={{ color: Number(r.position) <= 3 ? 'var(--gold)' : undefined }}>{r.position}</td>
                                <td><Link to={`/players/${r.id}`} style={{ fontWeight: 600 }}>{r.username}</Link></td>
                                <td className="num">{num(r.rank_points)}</td>
                                <td><span className={`badge ${tierBadgeClass(r.rank_tier)} tier`}>{r.rank_tier}</span></td>
                                <td className="num">{num(r.wins)} / {num(r.losses)}</td>
                                <td className="num">{winPct(r.wins, r.losses)}</td>
                                <td className="num">{num(r.play_streak)}</td>
                                <td className="num">{num(r.play_streak_best)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
