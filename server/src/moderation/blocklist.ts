// Lightweight text moderation for user-generated content (usernames and
// mystery-mode word submissions). This is a defense-in-depth backstop, not a
// full moderation system — the word bank is already curated to exclude
// vulgar answers, and usernames are regex-constrained. This catches obvious
// slurs/profanity that slip through.
//
// Keep the list conservative to avoid the "Scunthorpe problem" (false
// positives on innocent substrings). We match whole normalized tokens plus a
// short set of substrings that are unambiguous.

// Normalized (lowercase, leetspeak folded, non-alphanumerics stripped).
function normalize(input: string): string {
    return input
        .toLowerCase()
        .replace(/[4@]/g, 'a')
        .replace(/[3]/g, 'e')
        .replace(/[1!|]/g, 'i')
        .replace(/[0]/g, 'o')
        .replace(/[5$]/g, 's')
        .replace(/[7]/g, 't')
        .replace(/[^a-z0-9]/g, '');
}

// Unambiguous banned substrings. Intentionally short; expand as needed. The
// entries here are slurs/hard profanity that should never appear in a
// public-facing username or submitted word.
const BANNED_SUBSTRINGS: readonly string[] = [
    'nigger',
    'nigga',
    'faggot',
    'retard',
    'rape',
    'nazi',
    'cunt',
    'kike',
    'spic',
    'chink',
    'fuck',
    'shit',
    'bitch',
    'porn',
    'sex',
];

/** True if the text contains banned content. */
export function containsProfanity(text: string): boolean {
    const n = normalize(text);
    return BANNED_SUBSTRINGS.some((bad) => n.includes(bad));
}

/** Convenience for the two call sites; returns a reason or null. */
export function moderationError(text: string): string | null {
    return containsProfanity(text) ? 'That contains blocked content.' : null;
}
