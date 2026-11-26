// Keep the screen on while this screen is focused (matchmaking, a live
// match). expo-router keeps screens mounted after you leave them, so this
// follows focus, not mount.
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export function useKeepAwakeWhileFocused(tag: string): void {
    useFocusEffect(
        useCallback(() => {
            activateKeepAwakeAsync(tag).catch(() => {});
            return () => {
                deactivateKeepAwake(tag).catch(() => {});
            };
        }, [tag])
    );
}
