// Single source of truth for external links + support contact. The legal
// pages are served by the API server (server/src/routes/legal.ts), so by
// default they live next to the API; override per environment if you host
// them elsewhere.

import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { apiUrl } from '../api/client';

export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? `${apiUrl}/legal/privacy`;
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? `${apiUrl}/legal/terms`;
export const DELETE_ACCOUNT_URL =
    process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL ?? `${apiUrl}/legal/delete-account`;
export const SUPPORT_EMAIL =
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'adeyemibabatundejoseph@gmail.com';

/** Open a legal page in the in-app browser sheet. */
export function openLegal(url: string): void {
    WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));
}

/** Open the mail app addressed to support with a prefilled subject. */
export function contactSupport(subject = 'WordWar support'): void {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`).catch(
        () => {}
    );
}
