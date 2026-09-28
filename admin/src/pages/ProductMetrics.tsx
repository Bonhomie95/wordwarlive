import { useEffect, useState } from 'react';
import { api } from '../api';
type Metrics = {
    events: { event: string; offer: string; events: number; players: number }[];
    purchases: { product_id: string; purchases: number; buyers: number }[];
};
export default function ProductMetrics() {
    const [data, setData] = useState<Metrics>();
    const [error, setError] = useState('');
    useEffect(() => {
        api.get<Metrics>('/admin/product-metrics')
            .then(setData)
            .catch((e) => setError(e.message));
    }, []);
    return (
        <>
            <h2>Product uptake · last 30 days</h2>
            <p>
                Real accounts only. Client events measure interest; verified store transactions
                measure actual purchases. Counts are not attributed conversion rates or net revenue.
            </p>
            {error && <p role="alert">{error}</p>}
            <h3>Interest and onboarding</h3>
            <table>
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>Offer</th>
                        <th>Events</th>
                        <th>Players</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.events.map((r) => (
                        <tr key={r.event + r.offer}>
                            <td>{r.event}</td>
                            <td>{r.offer || '—'}</td>
                            <td>{r.events}</td>
                            <td>{r.players}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <h3>Verified purchases</h3>
            <table>
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Purchases</th>
                        <th>Buyers</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.purchases.map((r) => (
                        <tr key={r.product_id}>
                            <td>{r.product_id}</td>
                            <td>{r.purchases}</td>
                            <td>{r.buyers}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {data && !data.events.length && (
                <p>No recorded events yet. Collect beta usage before changing prices or offers.</p>
            )}
        </>
    );
}
