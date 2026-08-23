// Process-wide "draining" flag, flipped on SIGTERM/SIGINT. While draining we
// refuse to START anything new (matchmaking joins, friend challenges) so
// in-flight matches can finish before the process exits, but existing matches
// keep running normally.

let draining = false;

export function setShuttingDown(v: boolean): void {
    draining = v;
}

export function isShuttingDown(): boolean {
    return draining;
}
