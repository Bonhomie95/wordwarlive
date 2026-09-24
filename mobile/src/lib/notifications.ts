// Push notification registration + handling (Expo).
//
// After sign-in we request permission, obtain an Expo push token, and send it
// to the server (POST /api/push/register) so the backend can deliver friend-
// challenge invites while the app is backgrounded/closed. On sign-out we
// unregister the token.
//
// Native push only works in a dev-client / production build, not Expo Go, and
// not on simulators — every path degrades gracefully to a no-op.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { pushApi } from '../api/resources';

let currentToken: string | null = null;

// Foreground presentation: show the banner even while the app is open.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

function canUsePush(): boolean {
    // Expo Go can't receive remote push on SDK 53+, and simulators have no
    // push token. Require a real device on a native build.
    return (
        Device.isDevice &&
        Constants.executionEnvironment !== 'storeClient'
    );
}

/**
 * Register this device for push. With `prompt: false` (app launch) we only
 * register when permission was ALREADY granted — the system permission dialog
 * is shown in context instead (Friends screen), which is what Apple's HIG asks
 * for and converts far better than a cold-start prompt.
 */
export async function registerForPush(opts: { prompt: boolean } = { prompt: true }): Promise<void> {
    if (!canUsePush()) return;
    try {
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
            if (!opts.prompt || !existing.canAskAgain) return;
            const req = await Notifications.requestPermissionsAsync();
            status = req.status;
        }
        if (status !== 'granted') return;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.HIGH,
            });
        }

        const projectId =
            Constants.expoConfig?.extra?.eas?.projectId ??
            Constants.easConfig?.projectId;
        const tokenResp = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined
        );
        currentToken = tokenResp.data;
        await pushApi.register(
            currentToken,
            Platform.OS === 'ios' ? 'ios' : 'android'
        );
    } catch {
        // Permission denied / no network / not a push-capable build — fine.
    }
}

/** Remove this device's token on sign-out. */
export async function unregisterPush(): Promise<void> {
    if (!currentToken) return;
    try {
        await pushApi.unregister(currentToken);
    } catch {
        // best-effort
    } finally {
        currentToken = null;
    }
}

/** Wire tap-handling: when the user taps a friend-challenge push, hand the
 *  challenge id to the provided callback so the app can surface the prompt.
 *  Returns an unsubscribe function. */
export function onNotificationResponse(
    handler: (data: Record<string, unknown>) => void
): () => void {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
        const data = resp.notification.request.content.data ?? {};
        handler(data as Record<string, unknown>);
    });
    return () => sub.remove();
}
