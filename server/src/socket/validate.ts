// Runtime validation for socket events.
//
// HTTP routes validate their bodies with zod; the socket layer historically
// did not — it trusted the TypeScript types, which are erased at runtime.
// That let a malicious client send arbitrary payloads (e.g. an unexpected
// `powerup_use.kind`, which was interpolated into SQL). Every inbound event
// payload now goes through a schema here before any handler logic runs.

import { z } from 'zod';

export const guessSubmitSchema = z.object({
    guess: z.string().min(1).max(16),
});

export const powerUpSchema = z.object({
    // Whitelisted — this value ends up selecting a DB column, so it must be
    // one of exactly these three. Never trust the wire type at runtime.
    kind: z.enum(['reveal', 'scramble', 'lock']),
    targetGuessIndex: z.number().int().nonnegative().optional(),
});

export const emojiSchema = z.object({
    emoji: z.string().min(1).max(8),
});

export const privateJoinSchema = z.object({
    code: z.string().min(1).max(16),
});

export const friendChallengeSchema = z.object({
    friendId: z.string().uuid(),
});

export const friendChallengeRespondSchema = z.object({
    challengeId: z.string().min(1).max(64),
    accept: z.boolean(),
});

/** Parse a payload against a schema, returning the typed value or null. */
export function parse<T>(schema: z.ZodType<T>, payload: unknown): T | null {
    const r = schema.safeParse(payload);
    return r.success ? r.data : null;
}
