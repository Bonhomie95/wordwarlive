// Settings-aware haptics wrapper.
//
// Every in-app haptic goes through here so the user's "Haptics" setting is
// actually honored (previously the setting was stored but ignored — call
// sites hit expo-haptics directly). The enabled flag is a module-level cache
// updated from the Settings screen and restored at boot; reading it is
// synchronous so callers stay simple.

import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';

const HAPTICS_KEY = 'wordwar.haptics';

let enabled = true;

export function setHapticsEnabled(v: boolean): void {
    enabled = v;
    SecureStore.setItemAsync(HAPTICS_KEY, v ? '1' : '0').catch(() => {});
}

export function hapticsEnabled(): boolean {
    return enabled;
}

/** Restore the persisted preference at app start. */
export async function restoreHapticsPref(): Promise<void> {
    try {
        const v = await SecureStore.getItemAsync(HAPTICS_KEY);
        if (v === '0') enabled = false;
        else if (v === '1') enabled = true;
    } catch {
        // SecureStore unavailable — default to on.
    }
}

export function impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light): void {
    if (!enabled) return;
    Haptics.impactAsync(style).catch(() => {});
}

export function notify(type: Haptics.NotificationFeedbackType): void {
    if (!enabled) return;
    Haptics.notificationAsync(type).catch(() => {});
}

export function selection(): void {
    if (!enabled) return;
    Haptics.selectionAsync().catch(() => {});
}

// Re-export the enums so call sites can pass styles without importing
// expo-haptics directly.
export const ImpactStyle = Haptics.ImpactFeedbackStyle;
export const NotificationType = Haptics.NotificationFeedbackType;
