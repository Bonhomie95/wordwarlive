import { useState } from 'react';
import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '../../src/components/ui/Button';
import { useAuthStore } from '../../src/store/authStore';
import { useGoogleSignIn } from '../../src/auth/googleSignIn';
import { appleSignIn, isAppleAvailable } from '../../src/auth/appleSignIn';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, spacing } from '../../src/theme/typography';

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
        <SafeAreaView style={styles.safe}>
            <LinearGradient
                colors={['#0F1115', '#161B23', '#0F1115']}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.hero}>
                <Text style={styles.brand} allowFontScaling={false}>
                    WORDWAR
                </Text>
                <Text style={styles.tagline} allowFontScaling={false}>
                    1v1 word racing. 360 seconds. One winner.
                </Text>
            </View>

            <View style={styles.actions}>
                <Button
                    label="Continue as Guest"
                    onPress={onGuest}
                    busy={busy}
                />
                <Button
                    label="Sign in with Email"
                    onPress={() => router.push('/(auth)/login')}
                    variant="secondary"
                />
                {google.available ? (
                    <Button
                        label="Continue with Google"
                        onPress={onGoogle}
                        variant="secondary"
                        busy={oauthBusy || google.inProgress}
                    />
                ) : null}
                {isAppleAvailable() ? (
                    <AppleAuthentication.AppleAuthenticationButton
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={
                            AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        }
                        cornerRadius={10}
                        style={styles.appleButton}
                        onPress={onApple}
                    />
                ) : null}

                <Pressable onPress={() => router.push('/(auth)/register')}>
                    <Text style={styles.smallLink} allowFontScaling={false}>
                        Don&apos;t have an account?{' '}
                        <Text style={{ color: colors.primary }}>Create one</Text>
                    </Text>
                </Pressable>
            </View>

            <Text style={styles.footnote} allowFontScaling={false}>
                Guest play is available offline-friendly. Link an account later
                to keep your rank.
            </Text>
        </SafeAreaView>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: {
        flex: 1,
        paddingHorizontal: spacing.xl,
        justifyContent: 'space-between',
    },
    hero: {
        marginTop: spacing.xxl * 2,
        gap: spacing.md,
        alignItems: 'center',
    },
    brand: {
        fontSize: 56,
        fontWeight: typography.weights.black,
        color: colors.text,
        letterSpacing: 4,
    },
    tagline: {
        fontSize: typography.sizes.md,
        color: colors.textDim,
        textAlign: 'center',
    },
    actions: {
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    appleButton: {
        height: 52,
        width: '100%',
    },
    smallLink: {
        textAlign: 'center',
        color: colors.textDim,
        fontSize: typography.sizes.sm,
        marginTop: spacing.sm,
    },
    footnote: {
        textAlign: 'center',
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        marginBottom: spacing.lg,
    },
}));

// Use Link to silence unused warning; not necessary if removed.
void Link;
