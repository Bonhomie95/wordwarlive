// Settings-aware sound effects (mirrors lib/haptics). On by default; Settings
// has a Sound toggle and a volume bar. Plays alongside the player's music.
// iOS follows the silent switch, as games do there. Android plays at media
// volume in any ringer mode: with playsInSilentMode off, expo-audio skips
// play() whenever the phone is on vibrate, so most phones heard nothing.
// Files come from scripts/make-sounds.py.

import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';

const SOUND_KEY = 'wordwar.sound';
const VOLUME_KEY = 'wordwar.soundVolume';

const FILES = {
    matchFound: require('../../assets/sounds/match-found.wav'),
    guess: require('../../assets/sounds/guess.wav'),
    opponent: require('../../assets/sounds/opponent.wav'),
    invalid: require('../../assets/sounds/invalid.wav'),
    tick: require('../../assets/sounds/tick.wav'),
    win: require('../../assets/sounds/win.wav'),
    lose: require('../../assets/sounds/lose.wav'),
    coins: require('../../assets/sounds/coins.wav'),
    rankUp: require('../../assets/sounds/rankup.wav'),
    powerUp: require('../../assets/sounds/powerup.wav'),
};
export type SoundName = keyof typeof FILES;

/** Volume bar steps; volume is step / VOLUME_STEPS. */
export const VOLUME_STEPS = 5;

let enabled = true;
let volumeStep = 4;
const players: Partial<Record<SoundName, AudioPlayer>> = {};
const lastPlayed: Partial<Record<SoundName, number>> = {};

export function setSoundEnabled(v: boolean): void {
    enabled = v;
    SecureStore.setItemAsync(SOUND_KEY, v ? '1' : '0').catch(() => {});
}

export function soundVolumeStep(): number {
    return volumeStep;
}

export function setSoundVolumeStep(step: number): void {
    volumeStep = Math.max(1, Math.min(VOLUME_STEPS, Math.round(step)));
    for (const p of Object.values(players)) p.volume = volumeStep / VOLUME_STEPS;
    SecureStore.setItemAsync(VOLUME_KEY, String(volumeStep)).catch(() => {});
}

/** Restore the persisted preferences and load the players (app start). */
export async function restoreSoundPref(): Promise<void> {
    try {
        const v = await SecureStore.getItemAsync(SOUND_KEY);
        if (v === '0') enabled = false;
        else if (v === '1') enabled = true;
        const step = Number(await SecureStore.getItemAsync(VOLUME_KEY));
        if (step >= 1 && step <= VOLUME_STEPS) volumeStep = step;
    } catch {
        // SecureStore unavailable: keep the defaults.
    }
    try {
        await setAudioModeAsync({ playsInSilentMode: Platform.OS === 'android', interruptionMode: 'mixWithOthers' });
    } catch (e) {
        console.warn('[sound] audio mode not set', e);
    }
    for (const name of Object.keys(FILES) as SoundName[]) {
        try {
            const p = createAudioPlayer(FILES[name]);
            p.volume = volumeStep / VOLUME_STEPS;
            players[name] = p;
        } catch (e) {
            console.warn('[sound] no player for', name, e); // Expo Go has no native module
        }
    }
}

/** Play a sound effect. A repeat within 120 ms is dropped, so a burst of
 *  replayed events (reconnecting mid-match) makes one sound, not a pile. */
export function playSound(name: SoundName): void {
    const p = enabled ? players[name] : undefined;
    const now = Date.now();
    if (!p || now - (lastPlayed[name] ?? 0) < 120) return;
    lastPlayed[name] = now;
    try {
        p.seekTo(0).catch(() => {});
        p.play();
    } catch {
        // best-effort
    }
}
