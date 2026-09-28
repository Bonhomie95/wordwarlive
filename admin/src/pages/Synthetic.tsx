import { useEffect, useState } from 'react';
import { api } from '../api';
type Settings = {
    population: number;
    dailyMin: number;
    dailyMax: number;
    rankedMin: number;
    rankedMax: number;
    dailyCap: number;
    difficulty: string;
    realPlayerTarget: number;
};
type State = {
    defaults: Settings;
    versions: { id: number; settings: Settings; effective_day: string; reason: string }[];
    paused: boolean;
    realPlayers: number;
    effectiveDay: string;
};
export default function Synthetic() {
    const [state, setState] = useState<State>();
    const [form, setForm] = useState<Settings>();
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    function show(s: State) {
        setState(s);
        setForm(s.versions[0]?.settings ?? s.defaults);
    }
    useEffect(() => {
        api.get<State>('/admin/synthetic')
            .then(show)
            .catch((e) => setError(e.message));
    }, []);
    async function save(paused?: boolean) {
        setBusy(true);
        setError('');
        try {
            show(
                await api.post<State>(
                    '/admin/synthetic',
                    paused === undefined ? { settings: form, reason } : { paused, reason },
                ),
            );
            setReason('');
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <h2>Synthetic activity</h2>
            <p>
                New settings apply next UTC day. Published history is preserved. Pause stops new
                scheduled results immediately; resuming schedules activity from the next UTC day.
            </p>
            {error && <p role="alert">{error}</p>}
            {state && form && (
                <>
                    <p>
                        Status: <strong>{state.paused ? 'Paused' : 'Active'}</strong> · Real active
                        players: {state.realPlayers} · Next configuration day: {state.effectiveDay}
                    </p>
                    <div className="card" style={{ padding: 24, display: 'grid', gap: 16 }}>
                        {(
                            [
                                'population',
                                'dailyMin',
                                'dailyMax',
                                'rankedMin',
                                'rankedMax',
                                'dailyCap',
                                'realPlayerTarget',
                            ] as const
                        ).map((key) => (
                            <label key={key}>
                                {
                                    {
                                        population: 'Population ceiling (0–2500)',
                                        dailyMin: 'Daily minimum interval (minutes)',
                                        dailyMax: 'Daily maximum interval (minutes)',
                                        rankedMin: 'Ranked minimum interval (minutes)',
                                        rankedMax: 'Ranked maximum interval (minutes)',
                                        dailyCap: 'Maximum matches per player per day (1–9)',
                                        realPlayerTarget:
                                            'Real active players at which fillers reach zero',
                                    }[key]
                                }
                                <input
                                    className="input"
                                    type="number"
                                    value={form[key]}
                                    onChange={(e) =>
                                        setForm({ ...form, [key]: Number(e.target.value) })
                                    }
                                />
                            </label>
                        ))}
                        <label>
                            Filler difficulty
                            <select
                                className="input"
                                value={form.difficulty}
                                onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                            >
                                {['easy', 'medium', 'hard'].map((v) => (
                                    <option key={v}>{v}</option>
                                ))}
                            </select>
                        </label>
                        <p>
                            Population automatically tapers as real participation approaches the
                            target. Existing scores remain. Difficulty affects future Daily results
                            and adjusts the baseline for adaptive match opponents. Pausing also
                            stops new fallback opponents; matches already in progress finish
                            normally.
                        </p>
                        <label>
                            Reason (required)
                            <input
                                className="input"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </label>
                        <button
                            className="btn"
                            disabled={busy || reason.trim().length < 3}
                            onClick={() => save()}
                        >
                            Save next-day settings
                        </button>
                        <button
                            className="btn danger"
                            disabled={busy || reason.trim().length < 3}
                            onClick={() => save(!state.paused)}
                        >
                            {state.paused ? 'Resume next day' : 'Emergency pause'}
                        </button>
                    </div>
                    <h3>Configuration history</h3>
                    {state.versions.map((v) => (
                        <p key={v.id}>
                            Version {v.id} · {v.effective_day.slice(0, 10)} · {v.reason}
                        </p>
                    ))}
                </>
            )}
        </>
    );
}
