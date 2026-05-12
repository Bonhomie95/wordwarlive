// Single Groq client. All AI calls funnel through this so we get one place
// to add caching, rate-limit handling, and retries.

import Groq from 'groq-sdk';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let client: Groq | null = null;

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
    return env.GROQ_API_KEY.length > 0;
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
