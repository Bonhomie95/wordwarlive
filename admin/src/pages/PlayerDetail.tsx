import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Loading, ErrorNote, Badge, Modal, StatCard } from '../components/ui';
import { num, dateTime, dateOnly, winPct, tierBadgeClass, pct } from '../format';

interface Detail {
    user: Record<string, unknown> & {
        id: string;
        username: string;
        email: string | null;
        auth_provider: string;
        rank_points: number;
        rank_tier: string;
        wins: number;
        losses: number;
        win_streak: number;
        best_streak: number;
        play_streak: number;
        play_streak_best: number;
        coins: number;
        hint_credits: number;
        battle_pass_premium: boolean;
        battle_pass_xp: number;
        banned: boolean;
        banned_reason: string | null;
        banned_at: string | null;
        is_admin: boolean;
        is_bot: boolean;
        created_at: string;
        last_play_date: string | null;
        rank_position: string;
        total_players: string;
        streak_percentile: number;
        ads_removed: boolean;
        equipped_avatar: string | null;
        equipped_board_theme: string | null;
        equipped_victory_anim: string | null;
        equipped_nameplate: string | null;
        equipped_profile_border: string | null;
    };
    matches: {
        id: string; word: string; outcome: string; is_win: boolean; rank_delta: number;
        opponent: string; mode: string; duration_seconds: number; ended_at: string;
    }[];
    coinLedger: { amount: number; source: string; metadata: unknown; created_at: string }[];
    cosmetics: { cosmetic_id: string; acquired_via: string; acquired_at: string }[];
    iap: { platform: string; product_id: string; entitlement: string; created_at: string }[];
    reportsAgainst: { id: string; reason: string; detail: string | null; status: string; created_at: string }[];
    reportsBy: { id: string; target_type: string; target_id: string; reason: string; status: string; created_at: string }[];
    battlePassClaims: { tier: number; track: string; claimed_at: string }[];
    hintsUsed: number;
}

type ActionKind = 'ban' | 'unban' | 'adjust' | 'role' | 'delete' | null;

export default function PlayerDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const [d, setD] = useState<Detail | null>(null);
    const [err, setErr] = useState('');
    const [action, setAction] = useState<ActionKind>(null);

    const load = useCallback(() => {
        api.get<Detail>(`/admin/players/${id}`).then(setD).catch((e) => setErr(e.message));
    }, [id]);
    useEffect(load, [load]);

    if (err) return <ErrorNote error={err} />;
    if (!d) return <Loading />;
    const u = d.user;

    return (
        <>
            <Link className="back-link" to="/players">← All players</Link>

            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: 24 }}>{u.username}</h2>
                        {u.banned && <Badge tone="red">Banned</Badge>}
                        {u.is_admin && <Badge tone="green">Admin</Badge>}
                        {u.is_bot && <Badge tone="gray">Bot</Badge>}
                        {u.battle_pass_premium && <Badge tone="gold">Premium</Badge>}
                        {u.ads_removed && <Badge tone="blue">Ad-free</Badge>}
                    </div>
                    <div className="muted mono" style={{ marginTop: 6, fontSize: 12 }}>
                        {u.email ?? `${u.auth_provider} account`} · {u.id}
                    </div>
                    {u.banned && u.banned_reason && (
                        <div style={{ color: '#fca5a5', marginTop: 8, fontSize: 13 }}>
                            Banned {dateOnly(u.banned_at)} — {u.banned_reason}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {u.banned ? (
                        <button className="btn" onClick={() => setAction('unban')}>Unban</button>
                    ) : (
                        <button className="btn danger" onClick={() => setAction('ban')}>Ban</button>
                    )}
                    <button className="btn" onClick={() => setAction('adjust')}>Adjust</button>
                    <button className="btn" onClick={() => setAction('role')}>
                        {u.is_admin ? 'Revoke admin' : 'Make admin'}
                    </button>
                    <button className="btn danger" onClick={() => setAction('delete')}>Delete</button>
                </div>
            </div>

            <div className="grid cols-4" style={{ marginTop: 16 }}>
                <StatCard label="Rank" value={num(u.rank_points)} sub={<span className={`badge ${tierBadgeClass(u.rank_tier)} tier`}>{u.rank_tier}</span>} glow />
                <StatCard label="Global position" value={`#${u.rank_position}`} sub={`of ${num(u.total_players)} players`} />
                <StatCard label="Record" value={`${num(u.wins)}–${num(u.losses)}`} sub={`${winPct(u.wins, u.losses)} win rate`} />
                <StatCard label="Play streak" value={num(u.play_streak)} sub={`best ${num(u.play_streak_best)} · ${pct((u.streak_percentile ?? 0) * 100, 0)} percentile`} />
            </div>
            <div className="grid cols-4" style={{ marginTop: 16 }}>
                <StatCard label="Coins" value={num(u.coins)} />
                <StatCard label="Hint credits" value={num(u.hint_credits)} sub={`${num(d.hintsUsed)} used lifetime`} />
                <StatCard label="Battle pass XP" value={num(u.battle_pass_xp)} />
                <StatCard label="Win streak" value={num(u.win_streak)} sub={`best ${num(u.best_streak)}`} />
            </div>

            <div className="grid cols-2" style={{ marginTop: 16 }}>
                <div className="card">
                    <h3>Account</h3>
                    <div className="kv">
                        <span className="k">Joined</span><span className="v">{dateTime(u.created_at)}</span>
                        <span className="k">Last played</span><span className="v">{dateOnly(u.last_play_date)}</span>
                        <span className="k">Provider</span><span className="v">{u.auth_provider}</span>
                        <span className="k">User id</span><span className="v">{u.id}</span>
                    </div>
                </div>
                <div className="card">
                    <h3>Equipped cosmetics</h3>
                    <div className="kv">
                        <span className="k">Avatar</span><span className="v">{u.equipped_avatar ?? '—'}</span>
                        <span className="k">Board theme</span><span className="v">{u.equipped_board_theme ?? '—'}</span>
                        <span className="k">Victory anim</span><span className="v">{u.equipped_victory_anim ?? '—'}</span>
                        <span className="k">Nameplate</span><span className="v">{u.equipped_nameplate ?? '—'}</span>
                        <span className="k">Border</span><span className="v">{u.equipped_profile_border ?? '—'}</span>
                    </div>
                </div>
            </div>

            <Section title={`Recent matches (${d.matches.length})`}>
                <MiniTable
                    head={['Result', 'Word', 'Opponent', 'Mode', 'Δ', 'When']}
                    rows={d.matches.map((m) => [
                        <Badge tone={m.is_win ? 'green' : 'red'}>{m.is_win ? 'Win' : 'Loss'}</Badge>,
                        <span className="mono">{m.word}</span>,
                        m.opponent,
                        m.mode,
                        <span className={m.rank_delta >= 0 ? 'stat' : ''} style={{ color: m.rank_delta >= 0 ? 'var(--primary)' : '#fca5a5' }}>{m.rank_delta >= 0 ? '+' : ''}{m.rank_delta}</span>,
                        dateTime(m.ended_at),
                    ])}
                    empty="No matches yet."
                />
            </Section>

            <Section title={`Coin ledger (${d.coinLedger.length})`}>
                <MiniTable
                    head={['Amount', 'Source', 'When']}
                    rows={d.coinLedger.map((c) => [
                        <span style={{ color: c.amount >= 0 ? 'var(--primary)' : '#fca5a5' }} className="mono">{c.amount >= 0 ? '+' : ''}{num(c.amount)}</span>,
                        c.source,
                        dateTime(c.created_at),
                    ])}
                    empty="No coin activity."
                />
            </Section>

            <div className="grid cols-2">
                <Section title={`Cosmetics owned (${d.cosmetics.length})`}>
                    <MiniTable
                        head={['Item', 'Via', 'Acquired']}
                        rows={d.cosmetics.map((c) => [<span className="mono">{c.cosmetic_id}</span>, c.acquired_via, dateOnly(c.acquired_at)])}
                        empty="None."
                    />
                </Section>
                <Section title={`Purchases (${d.iap.length})`}>
                    <MiniTable
                        head={['Product', 'Platform', 'When']}
                        rows={d.iap.map((t) => [<span className="mono">{t.entitlement}</span>, t.platform, dateOnly(t.created_at)])}
                        empty="No purchases."
                    />
                </Section>
            </div>

            <div className="grid cols-2">
                <Section title={`Reports against (${d.reportsAgainst.length})`}>
                    <MiniTable
                        head={['Reason', 'Status', 'When']}
                        rows={d.reportsAgainst.map((r) => [r.reason, <Badge tone={r.status === 'open' ? 'amber' : 'gray'}>{r.status}</Badge>, dateOnly(r.created_at)])}
                        empty="Clean record."
                    />
                </Section>
                <Section title={`Battle pass claims (${d.battlePassClaims.length})`}>
                    <MiniTable
                        head={['Tier', 'Track', 'When']}
                        rows={d.battlePassClaims.map((b) => [`Tier ${b.tier}`, b.track, dateOnly(b.claimed_at)])}
                        empty="No claims."
                    />
                </Section>
            </div>

            {action && (
                <ActionModal
                    kind={action}
                    user={u}
                    onClose={() => setAction(null)}
                    onDone={(deleted) => {
                        setAction(null);
                        if (deleted) nav('/players');
                        else load();
                    }}
                />
            )}
        </>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ gridColumn: '1 / -1' }}>
            <h2 className="section-title">{title}</h2>
            {children}
        </div>
    );
}

function MiniTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
    if (rows.length === 0) return <div className="card muted" style={{ padding: 18 }}>{empty}</div>;
    return (
        <div className="table-wrap">
            <table>
                <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ActionModal({
    kind,
    user,
    onClose,
    onDone,
}: {
    kind: Exclude<ActionKind, null>;
    user: Detail['user'];
    onClose: () => void;
    onDone: (deleted: boolean) => void;
}) {
    const [reason, setReason] = useState('');
    const [coinsDelta, setCoinsDelta] = useState('');
    const [rankPoints, setRankPoints] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    async function run() {
        setBusy(true);
        setErr('');
        try {
            if (kind === 'ban') await api.post(`/admin/players/${user.id}/ban`, { reason });
            else if (kind === 'unban') await api.post(`/admin/players/${user.id}/unban`);
            else if (kind === 'role') await api.post(`/admin/players/${user.id}/role`, { admin: !user.is_admin });
            else if (kind === 'adjust')
                await api.post(`/admin/players/${user.id}/adjust`, {
                    coinsDelta: coinsDelta ? Number(coinsDelta) : undefined,
                    rankPoints: rankPoints ? Number(rankPoints) : undefined,
                    reason,
                });
            else if (kind === 'delete') await api.del(`/admin/players/${user.id}`);
            onDone(kind === 'delete');
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Failed');
            setBusy(false);
        }
    }

    const cfg = {
        ban: { title: `Ban ${user.username}?`, cta: 'Ban player', danger: true },
        unban: { title: `Unban ${user.username}?`, cta: 'Unban player', danger: false },
        adjust: { title: `Adjust ${user.username}`, cta: 'Apply changes', danger: false },
        role: { title: user.is_admin ? `Revoke admin from ${user.username}?` : `Make ${user.username} an admin?`, cta: user.is_admin ? 'Revoke admin' : 'Grant admin', danger: user.is_admin },
        delete: { title: `Delete ${user.username}?`, cta: 'Permanently delete', danger: true },
    }[kind];

    const deleteLocked = kind === 'delete' && confirmText !== user.username;

    return (
        <Modal
            title={cfg.title}
            onClose={onClose}
            actions={
                <>
                    <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
                    <button
                        className={`btn ${cfg.danger ? 'danger' : 'primary'}`}
                        onClick={run}
                        disabled={busy || deleteLocked}
                    >
                        {busy ? 'Working…' : cfg.cta}
                    </button>
                </>
            }
        >
            {kind === 'ban' && (
                <>
                    <p>Their live sessions are dropped immediately and they can't sign back in until unbanned.</p>
                    <div className="field">
                        <label>Reason (shown in audit log)</label>
                        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. cheating, harassment" autoFocus />
                    </div>
                </>
            )}
            {kind === 'unban' && <p>This restores full access for {user.username}.</p>}
            {kind === 'role' && (
                <p>
                    {user.is_admin
                        ? 'They will lose access to this admin panel.'
                        : 'They will be able to sign in to this admin panel with their email login and manage all players.'}
                </p>
            )}
            {kind === 'adjust' && (
                <>
                    <p>Leave a field blank to leave it unchanged. Coin changes are recorded in the ledger.</p>
                    <div className="field">
                        <label>Coins delta (+ grant / − remove)</label>
                        <input className="input" type="number" value={coinsDelta} onChange={(e) => setCoinsDelta(e.target.value)} placeholder={`current: ${num(user.coins)}`} />
                    </div>
                    <div className="field">
                        <label>Set rank points (absolute)</label>
                        <input className="input" type="number" value={rankPoints} onChange={(e) => setRankPoints(e.target.value)} placeholder={`current: ${num(user.rank_points)}`} />
                    </div>
                    <div className="field">
                        <label>Reason</label>
                        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="note for the audit log" />
                    </div>
                </>
            )}
            {kind === 'delete' && (
                <>
                    <p style={{ color: '#fca5a5' }}>
                        This permanently deletes the account and all their matches. This cannot be undone.
                        Type <strong>{user.username}</strong> to confirm.
                    </p>
                    <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={user.username} autoFocus />
                </>
            )}
            {err && <div className="login-err">{err}</div>}
        </Modal>
    );
}
