import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Loading, ErrorNote, Badge } from '../components/ui';
import { dateTime } from '../format';

interface Entry {
    id: number; admin_id: string | null; admin_name: string | null; action: string;
    target_type: string | null; target_id: string | null; detail: Record<string, unknown>; created_at: string;
}

const TONE: Record<string, string> = {
    ban: 'red', delete: 'red', demote: 'red', unban: 'green', promote: 'green',
    adjust: 'amber', report_status: 'blue',
};

export default function Audit() {
    const [rows, setRows] = useState<Entry[] | null>(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        api.get<Entry[]>('/admin/audit?limit=200').then(setRows).catch((e) => setErr(e.message));
    }, []);
    if (err) return <ErrorNote error={err} />;
    if (!rows) return <Loading />;
    return (
        <>
            <p className="muted" style={{ marginTop: 0 }}>Every moderation action, most recent first.</p>
            {rows.length === 0 ? (
                <div className="empty">No admin actions recorded yet.</div>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr><th>Action</th><th>Admin</th><th>Target</th><th>Detail</th><th>When</th></tr>
                        </thead>
                        <tbody>
                            {rows.map((e) => (
                                <tr key={e.id}>
                                    <td><Badge tone={TONE[e.action] ?? 'gray'}>{e.action}</Badge></td>
                                    <td>{e.admin_name ?? <span className="muted">—</span>}</td>
                                    <td>
                                        {e.target_type === 'user' && e.target_id ? (
                                            <Link className="mono" to={`/players/${e.target_id}`} style={{ fontSize: 12 }}>{e.target_id.slice(0, 8)}…</Link>
                                        ) : (
                                            <span className="mono dim" style={{ fontSize: 12 }}>{e.target_type} {e.target_id?.slice(0, 8) ?? ''}</span>
                                        )}
                                    </td>
                                    <td className="mono dim" style={{ fontSize: 12, maxWidth: 320, whiteSpace: 'normal' }}>
                                        {Object.keys(e.detail || {}).length ? JSON.stringify(e.detail) : '—'}
                                    </td>
                                    <td className="dim">{dateTime(e.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
