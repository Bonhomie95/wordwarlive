// Apple Sign-In wrapper. Apple is iOS-only — the welcome screen should
// hide the button on Android/Web by checking `isAppleAvailable()`.

import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

export function isAppleAvailable(): boolean {
    return Platform.OS === 'ios';
}

export async function appleSignIn(): Promise<string | null> {
    if (!isAppleAvailable()) return null;
    try {
        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            ],
        });
        return credential.identityToken;
    } catch (err) {
        const e = err as { code?: string };
        if (e.code === 'ERR_REQUEST_CANCELED') return null;
        throw err;
    }
}
