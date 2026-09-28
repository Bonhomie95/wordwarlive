import { useEffect, useState } from 'react';
import { api } from '../api';
type Event = { kind: string; ref: string; at: string; detail: unknown };
export function PlayerTimeline({ id }: { id: string }) {
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<Event[]>([]);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        const timer = setTimeout(() => {
            api.get<Event[]>(`/admin/players/${id}/timeline?search=${encodeURIComponent(search)}`)
                .then((r) => {
                    if (active) setRows(r);
                })
                .catch((e) => {
                    if (active) setError(e.message);
                });
        }, 250);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [id, search]);
    return (
        <section>
            <h2>Player timeline</h2>
            <input
                className="input"
                aria-label="Search player history"
                placeholder="Search matches, purchases, inventory or moderation"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
            {error && <p role="alert">{error}</p>}
            <p>Latest 100 matching events</p>
            {rows.map((r) => (
                <div className="card" key={r.kind + r.ref} style={{ padding: 12, marginTop: 8 }}>
                    <strong>{r.kind}</strong> · {new Date(r.at).toLocaleString()}
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {JSON.stringify(r.detail, null, 2)}
                    </pre>
                </div>
            ))}
        </section>
    );
}
