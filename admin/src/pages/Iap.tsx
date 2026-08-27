import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Loading, ErrorNote, Badge } from '../components/ui';
import { dateTime } from '../format';

interface Row {
    id: string; platform: string; product_id: string; entitlement: string;
    transaction_id: string; username: string | null; user_id: string | null; created_at: string;
}

export default function Iap() {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        api.get<Row[]>('/admin/iap?limit=200').then(setRows).catch((e) => setErr(e.message));
    }, []);
    if (err) return <ErrorNote error={err} />;
    if (!rows) return <Loading />;
    return (
        <>
            <p className="muted" style={{ marginTop: 0 }}>Most recent 200 in-app purchases (verified receipts).</p>
            <div className="table-wrap">
                <table>
                    <thead>
                        <tr><th>Buyer</th><th>Entitlement</th><th>Product</th><th>Platform</th><th>Transaction</th><th>When</th></tr>
                    </thead>
                    <tbody>
                        {rows.map((t) => (
                            <tr key={t.id}>
                                <td>{t.user_id ? <Link to={`/players/${t.user_id}`}>{t.username ?? '—'}</Link> : <span className="muted">deleted</span>}</td>
                                <td><Badge tone="green">{t.entitlement}</Badge></td>
                                <td className="mono dim" style={{ fontSize: 12 }}>{t.product_id}</td>
                                <td>{t.platform}</td>
                                <td className="mono dim" style={{ fontSize: 11 }}>{t.transaction_id}</td>
                                <td className="dim">{dateTime(t.created_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
