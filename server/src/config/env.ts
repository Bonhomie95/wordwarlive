// Validated, typed environment loading. Importing this file is the only way
// the rest of the codebase reads env — that gives us a single failure point
// if something's misconfigured.

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
        .default('info'),
    CORS_ORIGINS: z.string().default('*'),
    // How many proxy hops to trust for the client IP (rate limiting). 0 =
    // direct exposure (use the socket address). Set to 1 behind a single
    // load balancer / reverse proxy. Trusting more hops than you actually
    // have lets clients spoof X-Forwarded-For and bypass rate limits.
    TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),

    // Stable identity for THIS server instance. Used to namespace the
    // per-node matchmaking queue (so a node only ever pairs players whose
    // sockets it actually holds — see socket/matchmaking.ts) and to label
    // logs/metrics in a multi-node deployment. Defaults to the hostname, or
    // a random id if unset — but set it explicitly (e.g. the pod/task name)
    // in production so a restarted instance reuses its queue namespace.
    NODE_ID: z.string().optional().default(''),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    // Postgres pool size. The match-end path fans out several concurrent
    // queries per completed match, so this needs headroom under load. Behind
    // PgBouncer (transaction pooling) you can push this higher safely.
    DB_POOL_MAX: z.coerce.number().int().positive().default(50),

    JWT_SECRET: z
        .string()
        .min(
            32,
            'JWT_SECRET must be at least 32 chars. Generate one with: openssl rand -hex 64'
        ),
    JWT_EXPIRES_IN: z.string().default('30d'),

    GOOGLE_CLIENT_IDS: z.string().optional().default(''),
    APPLE_BUNDLE_ID: z.string().optional().default(''),
    // Sign in with Apple server credentials (Apple Developer → Keys → "Sign in
    // with Apple" key). Used to exchange the sign-in authorization code for a
    // refresh token and to REVOKE it on account deletion, which Apple requires
    // (guideline 5.1.1(v)). All three must be set together; otherwise revocation
    // is skipped with a warning.
    APPLE_TEAM_ID: z.string().optional().default(''),
    APPLE_KEY_ID: z.string().optional().default(''),
    // The .p8 contents. Newlines may be escaped as \n in the env value.
    APPLE_PRIVATE_KEY: z.string().optional().default(''),

    // Shown on the hosted legal pages and the account-deletion page.
    SUPPORT_EMAIL: z.string().optional().default('adeyemibabatundejoseph@gmail.com'),

    GROQ_API_KEY: z.string().optional().default(''),
    GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

    // Error reporting. When set (and @sentry/node installed), exceptions are
    // forwarded to Sentry; otherwise they're logged. Leave empty in dev.
    SENTRY_DSN: z.string().optional().default(''),

    // Optional bearer token guarding GET /metrics. Leave empty to expose it
    // openly (fine when only reachable on an internal network).
    METRICS_TOKEN: z.string().optional().default(''),

    // Comma-separated emails auto-promoted to admin at boot (and on their next
    // email login). This is how the FIRST admin is bootstrapped — set it, sign
    // in with that email, and you have the admin panel.
    ADMIN_EMAILS: z.string().optional().default(''),

    // ─── In-app purchase verification ───────────────────────────────────────
    // When false (dev default), purchase endpoints grant items without
    // contacting the stores so the shop stays interactive locally. Turn ON
    // in production so receipts are verified before anything is granted.
    // Defaults ON in production so a missing env can never ship unverified
    // purchases; set IAP_ENFORCE=false explicitly to opt out (dev/staging).
    IAP_ENFORCE: z
        .enum(['true', 'false'])
        .default(process.env.NODE_ENV === 'production' ? 'true' : 'false')
        .transform((v) => v === 'true'),
    // App Store shared secret (App Store Connect → App → App-Specific Shared
    // Secret). Required for iOS receipt verification when IAP_ENFORCE=true.
    APPLE_IAP_SHARED_SECRET: z.string().optional().default(''),
    // Play Store package name + a service-account JSON (stringified) with the
    // androidpublisher scope. Required for Android verification when enforced.
    GOOGLE_PLAY_PACKAGE_NAME: z.string().optional().default(''),
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),

    MATCH_DURATION_SECONDS: z.coerce.number().int().positive().default(360),
    MATCHMAKING_BOT_AFTER_SECONDS: z.coerce.number().int().positive().default(20),
    MATCHMAKING_RANGE_START: z.coerce.number().int().positive().default(200),
    MATCHMAKING_RANGE_EXPANDED: z.coerce.number().int().positive().default(500),
    GUESS_RATE_LIMIT_MS: z.coerce.number().int().nonnegative().default(2000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
        console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
}

export const env = {
    ...parsed.data,
    // Resolve a stable node id: explicit NODE_ID → OS hostname → random.
    nodeId:
        parsed.data.NODE_ID ||
        process.env.HOSTNAME ||
        `node-${randomUUID().slice(0, 8)}`,
    googleClientIds: parsed.data.GOOGLE_CLIENT_IDS.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    corsOrigins:
        parsed.data.CORS_ORIGINS === '*'
            ? '*'
            : parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()),
    adminEmails: parsed.data.ADMIN_EMAILS.split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    applePrivateKey: parsed.data.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    appleRevokeConfigured: !!(
        parsed.data.APPLE_BUNDLE_ID &&
        parsed.data.APPLE_TEAM_ID &&
        parsed.data.APPLE_KEY_ID &&
        parsed.data.APPLE_PRIVATE_KEY
    ),
} as const;

export type Env = typeof env;
