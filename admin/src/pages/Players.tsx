import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Loading, ErrorNote, Badge } from '../components/ui';
import { num, winPct, tierBadgeClass, relative, shortId } from '../format';

interface PlayerRow {
    id: string;
    username: string;
    email: string | null;
    auth_provider: string;
    is_bot: boolean;
    is_admin: boolean;
    banned: boolean;
    rank_points: number;
    rank_tier: string;
    wins: number;
    losses: number;
    win_pct: string;
    play_streak: number;
    play_streak_best: number;
    last_play_date: string | null;
    coins: number;
    premium: boolean;
    created_at: string;
    rank_position: string;
}
interface ListResp {
    rows: PlayerRow[];
    total: number;
    page: number;
    limit: number;
}

const FILTERS = [
    ['all', 'All'],
    ['players', 'Real players'],
    ['bots', 'Bots'],
    ['banned', 'Banned'],
    ['premium', 'Premium'],
    ['admins', 'Admins'],
] as const;

const COLUMNS: { key: string; label: string; sortable?: boolean; align?: 'num' }[] = [
    { key: 'rank_position', label: '#' },
    { key: 'username', label: 'Player', sortable: true },
    { key: 'rank_points', label: 'Rank pts', sortable: true, align: 'num' },
    { key: 'wins', label: 'W / L', sortable: true, align: 'num' },
    { key: 'win_pct', label: 'Win %', align: 'num' },
    { key: 'play_streak', label: 'Streak', sortable: true, align: 'num' },
    { key: 'best_streak', label: 'Best', sortable: true, align: 'num' },
    { key: 'coins', label: 'Coins', sortable: true, align: 'num' },
    { key: 'last_play_date', label: 'Last played', sortable: true },
    { key: 'status', label: 'Status' },
];

export default function Players() {
    const [params, setParams] = useSearchParams();
    const nav = useNavigate();

    const filter = params.get('filter') ?? 'all';
    const sort = params.get('sort') ?? 'rank_points';
    const order = (params.get('order') as 'asc' | 'desc') ?? 'desc';
    const page = Number(params.get('page') ?? '1');
    const search = params.get('search') ?? '';

    const [searchInput, setSearchInput] = useState(search);
    const [data, setData] = useState<ListResp | null>(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);

    const update = useCallback(
        (patch: Record<string, string>) => {
            const next = new URLSearchParams(params);
            Object.entries(patch).forEach(([k, v]) => {
                if (v) next.set(k, v);
                else next.delete(k);
            });
            setParams(next, { replace: true });
        },
        [params, setParams]
    );

    useEffect(() => {
        setLoading(true);
        const qs = new URLSearchParams({ filter, sort, order, page: String(page), limit: '25' });
        if (search) qs.set('search', search);
        api
            .get<ListResp>(`/admin/players?${qs}`)
            .then((d) => { setData(d); setErr(''); })
            .catch((e) => setErr(e.message))
            .finally(() => setLoading(false));
    }, [filter, sort, order, page, search]);

    function toggleSort(key: string) {
        if (sort === key) update({ order: order === 'asc' ? 'desc' : 'asc', page: '1' });
        else update({ sort: key, order: 'desc', page: '1' });
    }

    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

    return (
        <>
            <div className="toolbar">
                <form
                    className="grow"
                    onSubmit={(e) => { e.preventDefault(); update({ search: searchInput.trim(), page: '1' }); }}
                >
                    <input
                        className="input"
                        placeholder="Search username, email, or player id…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </form>
                <div className="chip-row">
                    {FILTERS.map(([key, label]) => (
                        <button
                            key={key}
                            className={`chip${filter === key ? ' active' : ''}`}
                            onClick={() => update({ filter: key, page: '1' })}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {err && <ErrorNote error={err} />}

            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            {COLUMNS.map((c) => (
                                <th
                                    key={c.key}
                                    className={c.sortable ? 'sortable' : ''}
                                    onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                                    style={c.align === 'num' ? { textAlign: 'right' } : undefined}
                                >
                                    {c.label}
                                    {sort === c.key ? (order === 'asc' ? ' ▲' : ' ▼') : ''}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data?.rows.map((r) => (
                            <tr key={r.id} className="row-click" onClick={() => nav(`/players/${r.id}`)}>
                                <td className="mono muted">{r.rank_position}</td>
                                <td>
                                    <div style={{ fontWeight: 600 }}>{r.username}</div>
                                    <div className="muted mono" style={{ fontSize: 11 }}>
                                        {r.email ?? r.auth_provider} · {shortId(r.id)}
                                    </div>
                                </td>
                                <td className="num">
                                    {num(r.rank_points)}
                                    <div>
                                        <span className={`badge ${tierBadgeClass(r.rank_tier)} tier`} style={{ fontSize: 10 }}>
                                            {r.rank_tier}
                                        </span>
                                    </div>
                                </td>
                                <td className="num">{num(r.wins)} / {num(r.losses)}</td>
                                <td className="num">{winPct(r.wins, r.losses)}</td>
                                <td className="num">{num(r.play_streak)}</td>
                                <td className="num">{num(r.play_streak_best)}</td>
                                <td className="num">{num(r.coins)}</td>
                                <td className="dim">{relative(r.last_play_date)}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {r.banned && <Badge tone="red">Banned</Badge>}
                                        {r.is_admin && <Badge tone="green">Admin</Badge>}
                                        {r.is_bot && <Badge tone="gray">Bot</Badge>}
                                        {r.premium && <Badge tone="gold">Premium</Badge>}
                                        {!r.banned && !r.is_admin && !r.is_bot && !r.premium && (
                                            <span className="muted">—</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {loading && <Loading />}
                {data && data.rows.length === 0 && !loading && <div className="empty">No players match.</div>}
            </div>

            <div className="pagination">
                <span>
                    {data ? `${num(data.total)} players · page ${page} of ${totalPages}` : ''}
                </span>
                <button className="btn sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                    ← Prev
                </button>
                <button
                    className="btn sm"
                    disabled={page >= totalPages}
                    onClick={() => update({ page: String(page + 1) })}
                >
                    Next →
                </button>
            </div>
        </>
    );
}
