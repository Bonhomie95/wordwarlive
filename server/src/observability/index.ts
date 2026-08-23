// Central error-capture hook. Everything that wants to report an exception
// goes through captureException() so we have ONE place to plug in a provider.
//
// Sentry is optional and loaded lazily: if SENTRY_DSN is set AND @sentry/node
// is installed, we forward there; otherwise we just log via pino. This keeps
// Sentry a soft dependency — the server runs fine without it, and you turn it
// on by setting the DSN and `npm i @sentry/node`.

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface SentryLike {
    init(opts: Record<string, unknown>): void;
    captureException(err: unknown, ctx?: unknown): void;
}

let sentry: SentryLike | null = null;
let initialized = false;

export async function initObservability(): Promise<void> {
    if (initialized) return;
    initialized = true;
    if (!env.SENTRY_DSN) return;
    try {
        // Optional dependency — only required when a DSN is configured. The
        // specifier is a variable so the compiler doesn't try to resolve it
        // at build time (Sentry is not a declared dependency).
        const specifier = '@sentry/node';
        const mod = (await import(specifier)) as unknown as SentryLike;
        mod.init({
            dsn: env.SENTRY_DSN,
            environment: env.NODE_ENV,
            tracesSampleRate: 0.1,
        });
        sentry = mod;
        logger.info('Sentry error reporting enabled');
    } catch {
        logger.warn(
            'SENTRY_DSN is set but @sentry/node is not installed — run `npm i @sentry/node` to enable it. Falling back to logs.'
        );
    }
}

/** Report an unexpected error. Always logs; also forwards to Sentry if on. */
export function captureException(
    err: unknown,
    context?: Record<string, unknown>
): void {
    logger.error({ err, ...context }, 'captureException');
    if (sentry) {
        try {
            sentry.captureException(err, context ? { extra: context } : undefined);
        } catch {
            // never let reporting throw
        }
    }
}
