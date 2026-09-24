// Link-account screen for GUEST (anonymous) players. Upgrades the current
// account in place — same username, rank, coins, cosmetics, and match
// history — by attaching real credentials (email/password, Google, or
// Apple). After linking, the player signs in with those credentials on any
// device and keeps everything.

import { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '../../src/components/ui/Button';
import { useAuthStore } from '../../src/store/authStore';
import { useGoogleSignIn } from '../../src/auth/googleSignIn';
import { appleSignIn, useAppleAvailable } from '../../src/auth/appleSignIn';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

export default function LinkAccount() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const linkEmail = useAuthStore((s) => s.linkEmail);
    const linkGoogle = useAuthStore((s) => s.linkGoogle);
    const linkApple = useAuthStore((s) => s.linkApple);
    const busy = useAuthStore((s) => s.busy);
    const google = useGoogleSignIn();
    const appleAvailable = useAppleAvailable();
    const [oauthBusy, setOauthBusy] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Only guests can link. If the account is already linked (or we landed
    // here by accident), show a friendly note instead of a broken form.
    if (!user || user.provider !== 'anonymous') {
        return (
            <SafeAreaView style={styles.safe}>
                <Header onBack={() => router.back()} />
                <Text style={styles.alreadyLinked} allowFontScaling={false}>
                    {user
                        ? `This account is already secured via ${user.provider}.`
                        : 'Not signed in.'}
                </Text>
            </SafeAreaView>
        );
    }

    function done() {
        Alert.alert(
            'Account linked!',
            'Your progress is safe. Use these credentials to sign in on any device.',
            [{ text: 'OK', onPress: () => router.back() }]
        );
    }

    async function onLinkEmail() {
        if (!email || !password) {
            Alert.alert('Missing fields', 'Email and password are required.');
            return;
        }
        if (password.length < 8) {
            Alert.alert('Weak password', 'Use at least 8 characters.');
            return;
        }
        try {
            await linkEmail(email, password);
            done();
        } catch (err) {
            Alert.alert(
                'Linking failed',
                err instanceof Error ? err.message : 'Try again.'
            );
        }
    }

    async function onLinkGoogle() {
        if (!google.available) {
            Alert.alert('Not configured', 'Google Sign-In env vars are missing.');
            return;
        }
        setOauthBusy(true);
        try {
            const idToken = await google.signIn();
            if (idToken) {
                await linkGoogle(idToken);
                done();
            }
        } catch (err) {
            Alert.alert(
                'Linking failed',
                err instanceof Error ? err.message : 'Try again.'
            );
        } finally {
            setOauthBusy(false);
        }
    }

    async function onLinkApple() {
        setOauthBusy(true);
        try {
            const cred = await appleSignIn();
            if (cred) {
                await linkApple(cred);
                done();
            }
        } catch (err) {
            Alert.alert(
                'Linking failed',
                err instanceof Error ? err.message : 'Try again.'
            );
        } finally {
            setOauthBusy(false);
        }
    }

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <Header onBack={() => router.back()} />

                    <View style={styles.keepCard}>
                        <Ionicons
                            name="shield-checkmark"
                            size={22}
                            color={colors.primary}
                        />
                        <Text style={styles.keepText} allowFontScaling={false}>
                            You&apos;re playing as{' '}
                            <Text style={{ color: colors.primary }}>
                                {user.username}
                            </Text>
                            . Linking keeps your rank, coins, cosmetics, and
                            match history — nothing is lost.
                        </Text>
                    </View>

                    {google.available ? (
                        <Button
                            label="Link with Google"
                            onPress={onLinkGoogle}
                            variant="secondary"
                            busy={oauthBusy || google.inProgress}
                        />
                    ) : null}
                    {appleAvailable ? (
                        <AppleAuthentication.AppleAuthenticationButton
                            buttonType={
                                AppleAuthentication.AppleAuthenticationButtonType
                                    .CONTINUE
                            }
                            buttonStyle={
                                AppleAuthentication.AppleAuthenticationButtonStyle
                                    .WHITE
                            }
                            cornerRadius={10}
                            style={styles.appleButton}
                            onPress={onLinkApple}
                        />
                    ) : null}

                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText} allowFontScaling={false}>
                            or with email
                        </Text>
                        <View style={styles.dividerLine} />
                    </View>

                    <View style={styles.form}>
                        <View style={styles.field}>
                            <Text style={styles.label} allowFontScaling={false}>
                                Email
                            </Text>
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                style={styles.input}
                                autoCapitalize="none"
                                autoComplete="email"
                                keyboardType="email-address"
                                placeholderTextColor={colors.textMuted}
                            />
                        </View>
                        <View style={styles.field}>
                            <Text style={styles.label} allowFontScaling={false}>
                                Password (8+ chars)
                            </Text>
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                style={styles.input}
                                autoCapitalize="none"
                                autoComplete="password-new"
                                secureTextEntry
                                placeholderTextColor={colors.textMuted}
                            />
                        </View>
                        <Button
                            label="Link email & password"
                            onPress={onLinkEmail}
                            busy={busy}
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function Header({ onBack }: { onBack: () => void }) {
    return (
        <View style={styles.header}>
            <Pressable
                onPress={onBack}
                hitSlop={12}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back"
            >
                <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <View>
                <Text style={styles.title} allowFontScaling={false}>
                    Link your account
                </Text>
                <Text style={styles.subtitle} allowFontScaling={false}>
                    Secure your progress with a sign-in method
                </Text>
            </View>
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    scroll: {
        padding: spacing.xl,
        gap: spacing.md,
        paddingBottom: spacing.xxl,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    backBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontFamily: typography.familyDisplay,
        color: colors.text,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.black,
    },
    subtitle: {
        fontFamily: typography.family,
        color: colors.textDim,
        fontSize: typography.sizes.xs,
    },
    alreadyLinked: {
        color: colors.textDim,
        textAlign: 'center',
        marginTop: spacing.xl,
        paddingHorizontal: spacing.xl,
    },
    keepCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primary,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    keepText: {
        fontFamily: typography.family,
        flex: 1,
        color: colors.text,
        fontSize: typography.sizes.sm,
        lineHeight: 19,
    },
    appleButton: {
        height: 52,
        width: '100%',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginVertical: spacing.xs,
    },
    dividerLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
    },
    dividerText: {
        fontFamily: typography.family,
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    form: { gap: spacing.lg },
    field: { gap: spacing.xs },
    label: { color: colors.textDim, fontSize: typography.sizes.sm },
    input: {
        fontFamily: typography.family,
        backgroundColor: colors.surfaceElevated,
        color: colors.text,
        height: 52,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: typography.sizes.md,
    },
}));
