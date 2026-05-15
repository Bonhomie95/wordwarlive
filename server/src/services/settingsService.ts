// User settings (sound, haptics, color-blind mode). Stored as JSONB on the
// users table so we can extend without migrations. Keys are validated here
// against the schema so a malformed PATCH can't poison the row.

import { query } from '../db/pool.js';

export interface UserSettings {
    sound: boolean;
    haptics: boolean;
    colorBlindMode: boolean;
}

const DEFAULT: UserSettings = {
    sound: true,
    haptics: true,
    colorBlindMode: false,
};

/** Read settings for a user, falling back to defaults for missing keys. */
export async function getSettings(userId: string): Promise<UserSettings> {
    const rows = await query<{ settings: UserSettings | null }>(
        'SELECT settings FROM users WHERE id = $1',
        [userId]
    );
    return { ...DEFAULT, ...(rows[0]?.settings ?? {}) };
}

/** Patch settings — only known keys are persisted. Unknown keys are ignored
 *  silently so old clients can't crash the row. */
export async function updateSettings(
    userId: string,
    patch: Partial<UserSettings>
): Promise<UserSettings> {
    const current = await getSettings(userId);
    const next: UserSettings = { ...current };
    if (typeof patch.sound === 'boolean') next.sound = patch.sound;
    if (typeof patch.haptics === 'boolean') next.haptics = patch.haptics;
    if (typeof patch.colorBlindMode === 'boolean') next.colorBlindMode = patch.colorBlindMode;
    await query(
        'UPDATE users SET settings = $1::jsonb, updated_at = now() WHERE id = $2',
        [JSON.stringify(next), userId]
    );
    return next;
}
