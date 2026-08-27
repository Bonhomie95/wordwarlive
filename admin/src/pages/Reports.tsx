import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Loading, ErrorNote, Badge } from '../components/ui';
import { dateTime } from '../format';

interface Report {
    id: string; target_type: string; target_id: string | null; reason: string; detail: string | null;
    status: string; created_at: string; reporter_name: string | null; reporter_id: string | null;
    target_name: string | null;
}

const STATUSES = ['open', 'reviewed', 'actioned', 'dismissed', 'all'];
const STATUS_TONE: Record<string, string> = { open: 'amber', reviewed: 'blue', actioned: 'green', dismissed: 'gray' };

export default function Reports() {
    const [status, setStatus] = useState('open');
    const [rows, setRows] = useState<Report[] | null>(null);
    const [err, setErr] = useState('');

    const load = useCallback(() => {
        setRows(null);
        api.get<Report[]>(`/admin/reports?status=${status}`).then(setRows).catch((e) => setErr(e.message));
    }, [status]);
    useEffect(load, [load]);

    async function setReportStatus(id: string, s: string) {
        await api.post(`/admin/reports/${id}/status`, { status: s });
        load();
    }

    return (
        <>
            <div className="toolbar">
                <div className="chip-row">
                    {STATUSES.map((s) => (
                        <button key={s} className={`chip${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>
                            {s[0].toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>
            {err && <ErrorNote error={err} />}
            {!rows ? (
                <Loading />
            ) : rows.length === 0 ? (
                <div className="empty">No {status === 'all' ? '' : status} reports.</div>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr><th>Target</th><th>Reason</th><th>Detail</th><th>Reporter</th><th>Status</th><th>Filed</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id}>
                                    <td>
                                        <span className="muted" style={{ fontSize: 11 }}>{r.target_type}</span><br />
                                        {r.target_type === 'user' && r.target_id ? (
                                            <Link to={`/players/${r.target_id}`}>{r.target_name ?? r.target_id}</Link>
                                        ) : (
                                            <span className="mono" style={{ fontSize: 12 }}>{r.target_id ?? '—'}</span>
                                        )}
                                    </td>
                                    <td><Badge tone="red">{r.reason}</Badge></td>
                                    <td className="dim" style={{ maxWidth: 260, whiteSpace: 'normal' }}>{r.detail ?? '—'}</td>
                                    <td>{r.reporter_id ? <Link to={`/players/${r.reporter_id}`}>{r.reporter_name ?? '—'}</Link> : <span className="muted">—</span>}</td>
                                    <td><Badge tone={STATUS_TONE[r.status] ?? 'gray'}>{r.status}</Badge></td>
                                    <td className="dim">{dateTime(r.created_at)}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {r.status !== 'actioned' && <button className="btn sm" onClick={() => setReportStatus(r.id, 'actioned')}>Action</button>}
                                            {r.status !== 'dismissed' && <button className="btn sm ghost" onClick={() => setReportStatus(r.id, 'dismissed')}>Dismiss</button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
