// Display helpers.

export function num(n: number | string | null | undefined): string {
    const v = Number(n ?? 0);
    return v.toLocaleString('en-US');
}

export function coins(n: number | string | null | undefined): string {
    return num(n);
}

export function pct(n: number | string | null | undefined, digits = 0): string {
    return `${Number(n ?? 0).toFixed(digits)}%`;
}

export function dateTime(s: string | null | undefined): string {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function dateOnly(s: string | null | undefined): string {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function relative(s: string | null | undefined): string {
    if (!s) return '—';
    const d = new Date(s).getTime();
    if (isNaN(d)) return '—';
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}d ago`;
    return dateOnly(s);
}

export function shortId(id: string | null | undefined): string {
    if (!id) return '—';
    return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

const TIER_CLASS: Record<string, string> = {
    stone: 'gray',
    bronze: 'amber',
    silver: 'gray',
    gold: 'gold',
    platinum: 'green',
    diamond: 'blue',
    master: 'blue',
    legend: 'gold',
};
export function tierBadgeClass(tier: string | null | undefined): string {
    return TIER_CLASS[(tier ?? '').toLowerCase()] ?? 'gray';
}

export function winPct(wins: number, losses: number): string {
    const t = wins + losses;
    return t === 0 ? '—' : `${((100 * wins) / t).toFixed(1)}%`;
}
