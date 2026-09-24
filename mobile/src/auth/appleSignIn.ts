// Sign in with Apple wrapper. Apple is iOS-only AND only available when the
// device/OS supports it — check at runtime so the button never renders where
// tapping it would fail.

import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

export interface AppleCredential {
    identityToken: string;
    /** One-time code the server exchanges for a refresh token so it can revoke
     *  the sign-in when the user deletes their account (Apple requirement). */
    authorizationCode: string | null;
}

/** True once Apple sign-in is confirmed available on this device. */
export function useAppleAvailable(): boolean {
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        let alive = true;
        AppleAuthentication.isAvailableAsync()
            .then((ok) => alive && setAvailable(ok))
            .catch(() => alive && setAvailable(false));
        return () => {
            alive = false;
        };
    }, []);
    return available;
}

/** Runs the native sheet. Resolves null when the user cancels. */
export async function appleSignIn(): Promise<AppleCredential | null> {
    if (Platform.OS !== 'ios') return null;
    try {
        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            ],
        });
        if (!credential.identityToken) return null;
        return {
            identityToken: credential.identityToken,
            authorizationCode: credential.authorizationCode,
        };
    } catch (err) {
        const e = err as { code?: string };
        if (e.code === 'ERR_REQUEST_CANCELED') return null;
        throw err;
    }
}
