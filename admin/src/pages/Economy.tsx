import { useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorNote, StatCard } from '../components/ui';
import { num } from '../format';

interface Economy {
    bySource: { source: string; granted: string | null; spent: string | null; events: string }[];
    totals: { granted: string; spent: string; circulating: string };
}

export default function EconomyPage() {
    const [d, setD] = useState<Economy | null>(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        api.get<Economy>('/admin/economy').then(setD).catch((e) => setErr(e.message));
    }, []);
    if (err) return <ErrorNote error={err} />;
    if (!d) return <Loading />;

    const maxFlow = Math.max(
        1,
        ...d.bySource.map((s) => Math.max(Number(s.granted ?? 0), Number(s.spent ?? 0)))
    );

    return (
        <>
            <div className="grid cols-3">
                <StatCard label="Coins in circulation" value={num(d.totals.circulating)} glow />
                <StatCard label="Total granted (all time)" value={num(d.totals.granted)} />
                <StatCard label="Total spent (all time)" value={num(d.totals.spent)} />
            </div>

            <h2 className="section-title">Coins by source</h2>
            <div className="table-wrap">
                <table>
                    <thead>
                        <tr><th>Source</th><th style={{ textAlign: 'right' }}>Granted</th><th style={{ textAlign: 'right' }}>Spent</th><th style={{ textAlign: 'right' }}>Events</th><th style={{ width: '30%' }}>Flow</th></tr>
                    </thead>
                    <tbody>
                        {d.bySource.map((s) => {
                            const g = Number(s.granted ?? 0), sp = Number(s.spent ?? 0);
                            return (
                                <tr key={s.source}>
                                    <td className="mono">{s.source}</td>
                                    <td className="num" style={{ color: g ? 'var(--primary)' : undefined }}>{g ? `+${num(g)}` : '—'}</td>
                                    <td className="num" style={{ color: sp ? '#fca5a5' : undefined }}>{sp ? `−${num(sp)}` : '—'}</td>
                                    <td className="num">{num(s.events)}</td>
                                    <td>
                                        <div className="bar"><span style={{ width: `${(Math.max(g, sp) / maxFlow) * 100}%`, background: g >= sp ? 'var(--primary)' : 'var(--danger)' }} /></div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}
