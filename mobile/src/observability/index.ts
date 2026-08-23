// Central observability hook for the app: error capture + lightweight event
// tracking. One module so there's a single place to wire a provider (Sentry
// for crashes, PostHog/Amplitude for analytics).
//
// It is a NO-OP by default and never throws, so the app behaves identically
// whether or not a provider is configured. To turn crash reporting on:
//   1. `npx expo install @sentry/react-native`
//   2. set EXPO_PUBLIC_SENTRY_DSN
//   3. drop the Sentry init into initObservability() below.
// The call sites (ErrorBoundary, API client, key screens) already funnel
// through captureError()/track(), so no other code changes are needed.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const ANALYTICS_KEY = process.env.EXPO_PUBLIC_ANALYTICS_KEY ?? '';

let started = false;

export function initObservability(): void {
    if (started) return;
    started = true;
    // Placeholder: when a provider is added, initialize it here using DSN /
    // ANALYTICS_KEY. Intentionally empty so the app runs provider-free today.
    if (__DEV__ && (DSN || ANALYTICS_KEY)) {
        // eslint-disable-next-line no-console
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
            // eslint-disable-next-line no-console
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
            // eslint-disable-next-line no-console
            console.log('[track]', event, props ?? '');
        }
        // When analytics is wired: analytics.capture(event, props)
    } catch {
        // never let tracking throw
    }
}
