// Single Groq client. All AI calls funnel through this so we get one place
// to add caching, rate-limit handling, and retries.

import Groq from 'groq-sdk';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let client: Groq | null = null;

/** Set when Groq rejects us with an account-level error (restricted org,
 *  bad key). Once set, isGroqEnabled() is false for the rest of the process
 *  so we stop hammering the API on every bot guess — callers fall back to
 *  the heuristic picker. Logged once at WARN, not per call. */
let fatalDisableReason: string | null = null;

function getClient(): Groq {
    if (!env.GROQ_API_KEY) {
        throw new Error(
            'GROQ_API_KEY is not set. Bot opponents and daily-word curation are disabled.'
        );
    }
    if (!client) client = new Groq({ apiKey: env.GROQ_API_KEY });
    return client;
}

export function isGroqEnabled(): boolean {
    return env.GROQ_API_KEY.length > 0 && fatalDisableReason === null;
}

/** Inspect a Groq error; if it's account-level (not transient), latch Groq
 *  off for this process. Transient errors (429, 5xx, network) don't latch. */
function maybeDisableOnFatal(err: unknown): void {
    if (fatalDisableReason) return;
    const e = err as { status?: number; error?: { error?: { code?: string } } };
    const code = e.error?.error?.code ?? '';
    const fatal =
        e.status === 401 ||
        e.status === 403 ||
        code === 'organization_restricted' ||
        code === 'invalid_api_key';
    if (fatal) {
        fatalDisableReason = code || `http_${e.status}`;
        logger.warn(
            { reason: fatalDisableReason },
            'Groq disabled for this process (account-level error). Bots use the heuristic fallback. Fix the API key / account and restart to re-enable.'
        );
    }
}

export interface GroqChatArgs {
    system: string;
    user: string;
    /** 0 = deterministic. Higher = more variance. */
    temperature?: number;
    /** Force JSON object output (Groq supports response_format). */
    json?: boolean;
    maxTokens?: number;
}

export async function groqChat(args: GroqChatArgs): Promise<string> {
    const c = getClient();
    const start = Date.now();
    try {
        return await groqChatInner(c, args, start);
    } catch (err) {
        maybeDisableOnFatal(err);
        throw err;
    }
}

async function groqChatInner(
    c: Groq,
    args: GroqChatArgs,
    start: number
): Promise<string> {
    const completion = await c.chat.completions.create({
        model: env.GROQ_MODEL,
        temperature: args.temperature ?? 0.4,
        max_tokens: args.maxTokens ?? 512,
        ...(args.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: args.user },
        ],
    });
    const text = completion.choices[0]?.message?.content ?? '';
    logger.debug(
        { ms: Date.now() - start, model: env.GROQ_MODEL, chars: text.length },
        'groq.chat'
    );
    return text;
}

/** Same as groqChat but parses JSON. Throws if the response isn't valid JSON. */
export async function groqJSON<T>(args: GroqChatArgs): Promise<T> {
    const raw = await groqChat({ ...args, json: true });
    try {
        return JSON.parse(raw) as T;
    } catch (err) {
        logger.error({ raw }, 'Groq returned non-JSON when JSON was requested');
        throw err;
    }
}
