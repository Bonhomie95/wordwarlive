// Settings-aware sound effects (mirrors lib/haptics). On by default; the
// Settings "Sound" toggle turns them off. Plays alongside the player's music
// and stays silent when the phone's silent switch is on.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';

const SOUND_KEY = 'wordwar.sound';

let enabled = true;
let matchFound: AudioPlayer | null = null;

export function setSoundEnabled(v: boolean): void {
    enabled = v;
    SecureStore.setItemAsync(SOUND_KEY, v ? '1' : '0').catch(() => {});
}

/** Restore the persisted preference and get the player ready (app start). */
export async function restoreSoundPref(): Promise<void> {
    try {
        const v = await SecureStore.getItemAsync(SOUND_KEY);
        if (v === '0') enabled = false;
        else if (v === '1') enabled = true;
    } catch {
        // SecureStore unavailable: default to on.
    }
    try {
        await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
        matchFound = createAudioPlayer(require('../../assets/sounds/match-found.wav'));
    } catch {
        matchFound = null; // no native module (Expo Go): stay silent
    }
}

/** Chime for "opponent found", so a player looking away hears it. */
export function playMatchFound(): void {
    if (!enabled || !matchFound) return;
    try {
        void matchFound.seekTo(0);
        matchFound.play();
    } catch {
        // best-effort
    }
}
