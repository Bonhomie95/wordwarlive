/** Loopback on a phone points at the phone, not the computer running Metro. */
export function resolveApiUrl(configured: string | undefined, development: boolean, metroHost?: string | null): string {
    const value = configured?.trim() || 'http://localhost:4000';
    const url = new URL(value);
    if (development && metroHost && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        const host = new URL(metroHost.includes('://') ? metroHost : `http://${metroHost}`).hostname;
        url.hostname = host;
    }
    return url.toString().replace(/\/$/, '');
}
