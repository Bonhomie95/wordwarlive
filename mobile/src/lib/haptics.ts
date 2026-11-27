// Settings-aware haptics wrapper.
//
// Every in-app haptic goes through here so the user's "Vibration" setting is
// honored. The enabled flag and strength are module-level caches updated
// from the Settings screen and restored at boot; reading them is synchronous
// so callers stay simple.
//
// Strength (Light / Medium / Strong) scales every haptic except selection
// ticks, which stay light because they fire on every key and button. On
// Android, expo-haptics vibrates at 12-27% of the motor's amplitude, which
// players barely feel, so Android uses RN Vibration at the device's default
// amplitude and scales the duration instead. iOS has no amplitude control:
// strength picks the impact style, and attention() uses the system buzz.

import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';

const HAPTICS_KEY = 'wordwar.haptics';
const STRENGTH_KEY = 'wordwar.hapticsStrength';

/** Strength bar steps: 1 Light, 2 Medium, 3 Strong. */
export const HAPTIC_STEPS = 3;
export const HAPTIC_STEP_LABELS = ['Light', 'Medium', 'Strong'];

const android = Platform.OS === 'android';
let enabled = true;
let strength = 2;

export function setHapticsEnabled(v: boolean): void {
    enabled = v;
    SecureStore.setItemAsync(HAPTICS_KEY, v ? '1' : '0').catch(() => {});
}

export function hapticsEnabled(): boolean {
    return enabled;
}

export function hapticsStep(): number {
    return strength;
}

export function setHapticsStep(step: number): void {
    strength = Math.max(1, Math.min(HAPTIC_STEPS, Math.round(step)));
    SecureStore.setItemAsync(STRENGTH_KEY, String(strength)).catch(() => {});
}

/** Restore the persisted preferences at app start. */
export async function restoreHapticsPref(): Promise<void> {
    try {
        const v = await SecureStore.getItemAsync(HAPTICS_KEY);
        if (v === '0') enabled = false;
        else if (v === '1') enabled = true;
        const step = Number(await SecureStore.getItemAsync(STRENGTH_KEY));
        if (step >= 1 && step <= HAPTIC_STEPS) strength = step;
    } catch {
        // SecureStore unavailable — keep the defaults.
    }
}

/** The Light / Medium / Strong entry for the current strength. */
function pick<T>(byStrength: readonly [T, T, T]): T {
    return byStrength[strength - 1] ?? byStrength[1];
}

/** Android: scale the "on" segments of a [wait, on, wait, on, ...] pattern. */
function androidPattern(pattern: number[]): number[] {
    const k = pick([0.6, 1, 1.5]);
    return pattern.map((ms, i) => (i % 2 ? Math.round(ms * k) : ms));
}

const IOS_IMPACTS = [Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy];
const ANDROID_IMPACT_MS: Record<Haptics.ImpactFeedbackStyle, number> = {
    [Haptics.ImpactFeedbackStyle.Soft]: 15,
    [Haptics.ImpactFeedbackStyle.Light]: 18,
    [Haptics.ImpactFeedbackStyle.Medium]: 30,
    [Haptics.ImpactFeedbackStyle.Rigid]: 40,
    [Haptics.ImpactFeedbackStyle.Heavy]: 45,
};
const ANDROID_NOTIFY: Record<Haptics.NotificationFeedbackType, number[]> = {
    [Haptics.NotificationFeedbackType.Success]: [0, 40, 60, 40],
    [Haptics.NotificationFeedbackType.Warning]: [0, 60, 80, 60],
    [Haptics.NotificationFeedbackType.Error]: [0, 40, 50, 40, 50, 40],
};

export function impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light): void {
    if (!enabled) return;
    if (android) {
        Vibration.vibrate(androidPattern([0, ANDROID_IMPACT_MS[style]]));
        return;
    }
    // Light/Medium/Strong shift the style one step down/none/up.
    const base = style === Haptics.ImpactFeedbackStyle.Soft ? 0 : style === Haptics.ImpactFeedbackStyle.Rigid ? 2 : Math.max(0, IOS_IMPACTS.indexOf(style));
    Haptics.impactAsync(IOS_IMPACTS[Math.max(0, Math.min(2, base + strength - 2))]).catch(() => {});
}

export function notify(type: Haptics.NotificationFeedbackType): void {
    if (!enabled) return;
    if (android) {
        Vibration.vibrate(androidPattern(ANDROID_NOTIFY[type]));
        return;
    }
    Haptics.notificationAsync(type).catch(() => {});
    if (strength === 3) setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 120);
}

export function selection(): void {
    if (!enabled) return;
    if (android) Vibration.vibrate([0, pick([10, 12, 15])]);
    else Haptics.selectionAsync().catch(() => {});
}

/** Opponent found: meant to be felt with the phone on the table or in a
 *  pocket. iOS Medium and Strong use the system vibration, one or two buzzes. */
export function attention(): void {
    if (!enabled) return;
    if (android) {
        Vibration.vibrate(pick([[0, 120, 90, 120], [0, 250, 110, 250], [0, 400, 130, 400]]));
    } else if (strength === 1) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
        Vibration.vibrate(strength === 3 ? [0, 500] : 400);
    }
}

// Re-export the enums so call sites can pass styles without importing
// expo-haptics directly.
export const ImpactStyle = Haptics.ImpactFeedbackStyle;
export const NotificationType = Haptics.NotificationFeedbackType;
