import { useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorNote, Badge } from '../components/ui';
import { dateTime } from '../format';

interface Row {
    id: string; p1: string; p2: string; word: string; outcome: string; winner: string | null;
    mode: string; p1_is_bot: boolean; p2_is_bot: boolean; duration_seconds: number; ended_at: string;
}

export default function Matches() {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        api.get<Row[]>('/admin/matches?limit=100').then(setRows).catch((e) => setErr(e.message));
    }, []);
    if (err) return <ErrorNote error={err} />;
    if (!rows) return <Loading />;
    return (
        <>
            <p className="muted" style={{ marginTop: 0 }}>Most recent 100 completed matches.</p>
            <div className="table-wrap">
                <table>
                    <thead>
                        <tr><th>Word</th><th>Player 1</th><th>Player 2</th><th>Winner</th><th>Mode</th><th>Outcome</th><th style={{ textAlign: 'right' }}>Duration</th><th>Ended</th></tr>
                    </thead>
                    <tbody>
                        {rows.map((m) => (
                            <tr key={m.id}>
                                <td className="mono" style={{ fontWeight: 700 }}>{m.word}</td>
                                <td>{m.p1}{m.p1_is_bot && <span className="muted"> ·bot</span>}</td>
                                <td>{m.p2}{m.p2_is_bot && <span className="muted"> ·bot</span>}</td>
                                <td>{m.winner ? <Badge tone="green">{m.winner}</Badge> : <span className="muted">draw</span>}</td>
                                <td>{m.mode}</td>
                                <td className="muted mono" style={{ fontSize: 12 }}>{m.outcome}</td>
                                <td className="num">{Math.floor(m.duration_seconds / 60)}:{String(m.duration_seconds % 60).padStart(2, '0')}</td>
                                <td className="dim">{dateTime(m.ended_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
