// Validated, typed environment loading. Importing this file is the only way
// the rest of the codebase reads env — that gives us a single failure point
// if something's misconfigured.

import 'dotenv/config';
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

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    JWT_SECRET: z
        .string()
        .min(
            32,
            'JWT_SECRET must be at least 32 chars. Generate one with: openssl rand -hex 64'
        ),
    JWT_EXPIRES_IN: z.string().default('30d'),

    GOOGLE_CLIENT_IDS: z.string().optional().default(''),
    APPLE_BUNDLE_ID: z.string().optional().default(''),

    GROQ_API_KEY: z.string().optional().default(''),
    GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

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
    googleClientIds: parsed.data.GOOGLE_CLIENT_IDS.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    corsOrigins:
        parsed.data.CORS_ORIGINS === '*'
            ? '*'
            : parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()),
} as const;

export type Env = typeof env;
