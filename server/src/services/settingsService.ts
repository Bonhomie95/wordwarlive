// User settings (sound, haptics, color-blind mode). Stored as a sub-document
// on the users collection so we can extend without migrations. Keys are
// validated here against the schema so a malformed PATCH can't poison the row.

import { col } from '../db/mongo.js';

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
    const u = await col<{ id: string; settings: Partial<UserSettings> | null }>('users')
        .findOne({ id: userId }, { projection: { _id: 0, settings: 1 } });
    return { ...DEFAULT, ...(u?.settings ?? {}) };
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
    await col('users').updateOne({ id: userId }, { $set: { settings: next, updated_at: new Date() } });
    return next;
}
