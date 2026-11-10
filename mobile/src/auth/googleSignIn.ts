// Google Sign-In. Returns the id_token which we hand to the server for
// verification.
//
//   iOS:     expo-auth-session in the system browser sheet (iOS OAuth client).
//   Android: the native Google Sign-In SDK. Google no longer accepts the
//            custom-URI-scheme redirect the browser flow needs for Android
//            OAuth clients, so the browser flow cannot work there. The native
//            SDK matches the app's package + signing SHA-1 against an Android
//            client in the same Cloud project as the Web client below, and the
//            returned id_token's audience is that Web client.

import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

const androidWebClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID;
let nativeConfigured = false;

/** Native Android sign-in; null when cancelled. Throws with a readable message. */
async function nativeAndroidSignIn(): Promise<string | null> {
    if (!androidWebClientId) throw new Error('Google Sign-In is not configured.');
    if (!nativeConfigured) {
        GoogleSignin.configure({ webClientId: androidWebClientId });
        nativeConfigured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Clear the cached account so the chooser always appears (lets players
    // pick a different Google account when linking).
    await GoogleSignin.signOut().catch(() => {});
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return null;
    if (!res.data.idToken) throw new Error('Google did not return an ID token.');
    return res.data.idToken;
}

export interface GoogleSignInHook {
    /** True while the OAuth dance is in progress. */
    inProgress: boolean;
    /** Last error message (e.g. user cancelled). */
    error: string | null;
    /** Trigger the OAuth flow. */
    signIn: () => Promise<string | null>;
    /** True iff Google is configured (env vars present). */
    available: boolean;
}

/**
 * Hook wrapping expo-auth-session's Google provider. Returns the id_token,
 * not the access token — server-side verification needs id_token.
 */
export function useGoogleSignIn(): GoogleSignInHook {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

    const available =
        Platform.OS === 'android'
            ? Boolean(androidWebClientId)
            : Boolean(webClientId || iosClientId || androidClientId);

    // iOS: Google only accepts the reversed-client-ID redirect for this iOS
    // client (the default `<bundleId>:/oauthredirect` came back as
    // redirect_uri_mismatch → "Access blocked: request is invalid"). The same
    // scheme is registered in app.config.ts so the redirect reopens the app.
    const iosRedirect =
        Platform.OS === 'ios' && iosClientId
            ? `${reversedClientId(iosClientId)}:/oauthredirect`
            : undefined;

    const [, response, promptAsync] = Google.useIdTokenAuthRequest({
        clientId: webClientId,
        iosClientId,
        androidClientId,
        ...(iosRedirect ? { redirectUri: iosRedirect } : {}),
    });

    const [inProgress, setInProgress] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingResolver, setPendingResolver] = useState<
        ((tok: string | null) => void) | null
    >(null);

    // Resolving the pending sign-in promise from the response effect is the
    // intended pattern for expo-auth-session.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!response || !pendingResolver) return;
        if (response.type === 'success' && response.params?.id_token) {
            pendingResolver(response.params.id_token);
            setPendingResolver(null);
            setInProgress(false);
        } else if (response.type === 'error') {
            setError(response.error?.description ?? 'Google sign-in failed');
            pendingResolver(null);
            setPendingResolver(null);
            setInProgress(false);
        } else if (response.type === 'cancel' || response.type === 'dismiss') {
            pendingResolver(null);
            setPendingResolver(null);
            setInProgress(false);
        }
    }, [response, pendingResolver]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const signIn = async (): Promise<string | null> => {
        if (!available) {
            setError('Google Sign-In is not configured.');
            return null;
        }
        setError(null);
        setInProgress(true);
        if (Platform.OS === 'android') {
            try {
                return await nativeAndroidSignIn();
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Google sign-in failed');
                return null;
            } finally {
                setInProgress(false);
            }
        }
        return new Promise<string | null>((resolve) => {
            setPendingResolver(() => resolve);
            promptAsync();
        });
    };

    return { inProgress, error, signIn, available };
}

/** `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc` */
export function reversedClientId(clientId: string): string {
    return `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;
}
