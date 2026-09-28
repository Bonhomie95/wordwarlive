import { apiRequest } from '../api/client';
// First-party, allowlisted product events go to our authenticated API.
// Error capture is console-only until an external crash provider is configured.
// Reporting is best-effort and never blocks gameplay or store transactions.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const ANALYTICS_KEY = process.env.EXPO_PUBLIC_ANALYTICS_KEY ?? '';

let started = false;

export function initObservability(): void {
    if (started) return;
    started = true;
    // Placeholder: when a provider is added, initialize it here using DSN /
    // ANALYTICS_KEY. Intentionally empty so the app runs provider-free today.
    if (__DEV__ && (DSN || ANALYTICS_KEY)) {
         
        console.log('[observability] provider keys present (init stub)');
    }
}

/** Report a handled or fatal error. Always safe to call. */
export function captureError(
    error: unknown,
    context?: Record<string, unknown>
): void {
    try {
        if (__DEV__) {
             
            console.error('[captureError]', error, context ?? '');
        }
        // When Sentry is wired: Sentry.captureException(error, { extra: context })
    } catch {
        // never let reporting throw
    }
}

/** Record a product analytics event. Always safe to call. */
export function track(
    event: string,
    props?: Record<string, unknown>
): void {
    try {
        if (__DEV__) {
             
            console.log('[track]', event, props ?? '');
        }
        if (['shop_view','offer_view','purchase_attempt','purchase_completed','tutorial_started','tutorial_completed','tutorial_skipped'].includes(event)) {
            void apiRequest('/api/events', { method: 'POST', body: {event, offer: typeof props?.offer === 'string' ? props.offer : ''}, retries: 0, timeoutMs: 4000 }).catch(() => {});
        }
    } catch {
        // never let tracking throw
    }
}
