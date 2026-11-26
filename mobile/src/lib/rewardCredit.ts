// Rewarded ads are credited by AdMob calling our server (SSV), which can land
// a few seconds to a minute after the ad closes. Refreshing once right away
// showed the old numbers, so it looked like the ad paid nothing. Poll the
// profile until the credit is visible (or give up after a deadline).

import { useAuthStore } from '../store/authStore';
import type { MeResponse } from '../types/index';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function currentMe(): MeResponse | null {
    const u = useAuthStore.getState().user;
    return u && 'ads' in u ? (u as MeResponse) : null;
}

/** Resolves true once `credited(me)` holds after a refresh, false after `timeoutMs`. */
export async function waitForCredit(credited: (me: MeResponse) => boolean, timeoutMs = 45_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let wait = 1200;
    while (Date.now() < deadline) {
        await sleep(wait);
        await useAuthStore.getState().refreshMe();
        const me = currentMe();
        if (me && credited(me)) return true;
        wait = Math.min(4000, wait + 800);
    }
    return false;
}
