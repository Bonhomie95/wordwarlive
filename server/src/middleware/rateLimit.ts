// HTTP rate limiters. These protect the REST surface from brute-force and
// spam. Real-time gameplay is rate-limited separately in the socket layer
// (guess submissions via Redis), so these only cover the Express routes.
//
// Limits are per-IP. Behind a proxy/load balancer you MUST set
// `app.set('trust proxy', …)` so req.ip is the real client, not the proxy —
// otherwise every request shares one bucket. That's wired up in index.ts.

import rateLimit, { type Options } from 'express-rate-limit';

const shared: Partial<Options> = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
};

/**
 * Broad limiter for the whole API. Generous enough that a normal player never
 * hits it, tight enough to blunt scripted abuse.
 */
export const apiLimiter = rateLimit({
    ...shared,
    windowMs: 60_000, // 1 minute
    limit: 120, // 120 req/min/IP across /api
});

/**
 * Strict limiter for credential + account-creation endpoints. Mounted on the
 * auth router so login can't be brute-forced and anonymous/register can't be
 * used to mass-create accounts.
 */
export const authLimiter = rateLimit({
    ...shared,
    windowMs: 15 * 60_000, // 15 minutes
    limit: 30, // 30 attempts / 15 min / IP
    // Don't count successful logins/registers against the budget — only
    // failed or repeated attempts should exhaust it.
    skipSuccessfulRequests: true,
});
