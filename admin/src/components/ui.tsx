import { type ReactNode, useEffect } from 'react';

export function Spinner() {
    return <div className="spinner" />;
}

export function Loading({ label }: { label?: string }) {
    return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text-dim)', padding: 24 }}>
            <Spinner />
            {label ?? 'Loading…'}
        </div>
    );
}

export function ErrorNote({ error }: { error: string }) {
    return (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}>
            {error}
        </div>
    );
}

export function StatCard({
    label,
    value,
    sub,
    glow,
}: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    glow?: boolean;
}) {
    return (
        <div className={`card stat${glow ? ' glow' : ''}`}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
            {sub != null && <div className="sub">{sub}</div>}
        </div>
    );
}

export function Badge({ tone = 'gray', children }: { tone?: string; children: ReactNode }) {
    return <span className={`badge ${tone}`}>{children}</span>;
}

export function Modal({
    title,
    children,
    onClose,
    actions,
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    actions?: ReactNode;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>{title}</h2>
                {children}
                {actions && <div className="actions">{actions}</div>}
            </div>
        </div>
    );
}
