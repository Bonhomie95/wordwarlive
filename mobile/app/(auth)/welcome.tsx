import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '../../src/components/ui/Button';
import { Screen } from '../../src/components/ui/Screen';
import { Wordmark } from '../../src/components/ui/Wordmark';
import { MonoLabel } from '../../src/components/ui/primitives';
import { useAuthStore } from '../../src/store/authStore';
import { useGoogleSignIn } from '../../src/auth/googleSignIn';
import { appleSignIn, isAppleAvailable } from '../../src/auth/appleSignIn';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

const APP_VERSION = 'v0.1.0 · STABLE';

export default function Welcome() {
    const router = useRouter();
    const signInAnonymous = useAuthStore((s) => s.signInAnonymous);
    const signInGoogle = useAuthStore((s) => s.signInGoogle);
    const signInApple = useAuthStore((s) => s.signInApple);
    const busy = useAuthStore((s) => s.busy);
    const google = useGoogleSignIn();
    const [oauthBusy, setOauthBusy] = useState(false);

    async function onGuest() {
        try {
            await signInAnonymous();
        } catch (err) {
            Alert.alert('Sign-in failed', err instanceof Error ? err.message : 'Try again.');
        }
    }

    async function onGoogle() {
        if (!google.available) {
            Alert.alert('Not configured', 'Google Sign-In env vars are missing.');
            return;
        }
        setOauthBusy(true);
        try {
            const idToken = await google.signIn();
            if (idToken) await signInGoogle(idToken);
        } catch (err) {
            Alert.alert('Google sign-in failed', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setOauthBusy(false);
        }
    }

    async function onApple() {
        setOauthBusy(true);
        try {
            const idToken = await appleSignIn();
            if (idToken) await signInApple(idToken);
        } catch (err) {
            Alert.alert('Apple sign-in failed', err instanceof Error ? err.message : 'Try again.');
        } finally {
            setOauthBusy(false);
        }
    }

    return (
        <Screen>
            <View style={styles.container}>
                {/* Hero */}
                <View style={styles.hero}>
                    <Wordmark size={typography.sizes.display} />
                    <MonoLabel size={13} style={styles.tagline}>
                        1v1 competitive word game
                    </MonoLabel>
                </View>

                {/* Primary quick-play */}
                <View style={styles.actions}>
                    <Button label="PLAY NOW  ⚡" onPress={onGuest} busy={busy} />
                    <MonoLabel size={10} style={styles.connecting}>
                        Race a live opponent in seconds
                    </MonoLabel>

                    <View style={styles.divider}>
                        <View style={styles.line} />
                        <MonoLabel size={10}>Save progress</MonoLabel>
                        <View style={styles.line} />
                    </View>

                    {isAppleAvailable() ? (
                        <AppleAuthentication.AppleAuthenticationButton
                            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                            cornerRadius={radius.md}
                            style={styles.appleButton}
                            onPress={onApple}
                        />
                    ) : null}
                    {google.available ? (
                        <Button
                            label="Continue with Google"
                            onPress={onGoogle}
                            variant="secondary"
                            icon="logo-google"
                            busy={oauthBusy || google.inProgress}
                        />
                    ) : null}
                    <Button
                        label="Continue with Email"
                        onPress={() => router.push('/(auth)/login')}
                        variant="secondary"
                        icon="mail-outline"
                    />

                    <Pressable
                        onPress={() => router.push('/(auth)/register')}
                        hitSlop={8}
                    >
                        <Text style={styles.smallLink} allowFontScaling={false}>
                            New here?{' '}
                            <Text style={{ color: colors.primary }}>Create an account</Text>
                        </Text>
                    </Pressable>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <View style={styles.versionPill}>
                        <Ionicons name="ellipse" size={7} color={colors.primary} />
                        <MonoLabel size={9}>{APP_VERSION}</MonoLabel>
                    </View>
                </View>
            </View>
        </Screen>
    );
}

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        container: {
            flex: 1,
            paddingHorizontal: spacing.xl,
            justifyContent: 'space-between',
        },
        hero: {
            marginTop: spacing.xxl,
            alignItems: 'center',
            gap: spacing.sm,
        },
        tagline: { textAlign: 'center' },
        actions: { gap: spacing.md },
        connecting: { textAlign: 'center', marginTop: -4, marginBottom: spacing.xs },
        divider: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginVertical: spacing.sm,
        },
        line: { flex: 1, height: 1, backgroundColor: colors.border },
        appleButton: { height: 54, width: '100%' },
        smallLink: {
            textAlign: 'center',
            color: colors.textDim,
            fontFamily: typography.familyMono,
            fontSize: typography.sizes.sm,
            marginTop: spacing.xs,
        },
        footer: { alignItems: 'center', paddingBottom: spacing.md },
        versionPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.pill,
            paddingHorizontal: 12,
            paddingVertical: 5,
        },
    })
);

void Link;
