import { useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorNote, StatCard } from '../components/ui';
import { num } from '../format';

interface Economy {
    bySource: { source: string; granted: string | null; spent: string | null; events: string }[];
    monetization: { transactions: string; buyers: string; rewarded_ads: string; ad_viewers: string; products: { product_id: string; transactions: string; buyers: string }[] };
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

            <h2 className="section-title">Monetization · last 30 days</h2>
            <div className="grid cols-3">
                <StatCard label="Verified purchases" value={num(d.monetization.transactions)} />
                <StatCard label="Paying players" value={num(d.monetization.buyers)} />
                <StatCard label="Rewarded ads completed" value={num(d.monetization.rewarded_ads)} sub={`${num(d.monetization.ad_viewers)} viewers`} />
            </div>
            <p className="muted">Local test purchases and unverified legacy records are excluded. Net revenue and refunds remain in the store and AdMob financial reports.</p>
            {d.monetization.products.length > 0 && <div className="table-wrap"><table><thead><tr><th>Product</th><th>Purchases</th><th>Buyers</th></tr></thead><tbody>{d.monetization.products.map((p) => <tr key={p.product_id}><td>{p.product_id}</td><td>{num(p.transactions)}</td><td>{num(p.buyers)}</td></tr>)}</tbody></table></div>}
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
