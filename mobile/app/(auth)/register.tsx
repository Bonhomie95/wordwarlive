import { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/ui/Button';
import { useAuthStore } from '../../src/store/authStore';
import { useGoogleSignIn } from '../../src/auth/googleSignIn';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

export default function Register() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const registerEmail = useAuthStore((s) => s.registerEmail);
    const signInGoogle = useAuthStore((s) => s.signInGoogle);
    const busy = useAuthStore((s) => s.busy);
    const google = useGoogleSignIn();
    const [oauthBusy, setOauthBusy] = useState(false);

    async function onSubmit() {
        if (!email || !password || !username) {
            Alert.alert('Missing fields', 'Username, email and password are all required.');
            return;
        }
        if (password.length < 8) {
            Alert.alert('Weak password', 'Use at least 8 characters.');
            return;
        }
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
            Alert.alert(
                'Invalid username',
                'Letters, numbers, and underscores only — 3 to 16 characters.'
            );
            return;
        }
        try {
            await registerEmail(email, password, username);
        } catch (err) {
            Alert.alert('Registration failed', err instanceof Error ? err.message : 'Try again.');
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

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.flex}>
                    <Text style={styles.title} allowFontScaling={false}>Create account</Text>
                    <Text style={styles.subtitle} allowFontScaling={false}>
                        Pick a name. You can change cosmetics anytime.
                    </Text>

                    <View style={styles.form}>
                        <Field
                            label="Username"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                        <Field
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            autoComplete="email"
                            keyboardType="email-address"
                        />
                        <Field
                            label="Password (8+ chars)"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoComplete="password-new"
                        />
                    </View>
                </View>

                <View style={styles.actions}>
                    <Button label="Create account" onPress={onSubmit} busy={busy} />

                    {google.available ? (
                        <>
                            <View style={styles.divider}>
                                <View style={styles.dividerLine} />
                                <Text style={styles.dividerText} allowFontScaling={false}>or</Text>
                                <View style={styles.dividerLine} />
                            </View>
                            <Button
                                label="Continue with Google"
                                onPress={onGoogle}
                                variant="secondary"
                                busy={oauthBusy || google.inProgress}
                            />
                        </>
                    ) : null}

                    <Button label="Back" onPress={() => router.back()} variant="ghost" />
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function Field(p: {
    label: string;
    value: string;
    onChangeText: (s: string) => void;
    secureTextEntry?: boolean;
    autoCapitalize?: 'none' | 'sentences';
    autoComplete?: 'email' | 'password-new' | 'username';
    keyboardType?: 'default' | 'email-address';
}) {
    return (
        <View style={styles.field}>
            <Text style={styles.label} allowFontScaling={false}>{p.label}</Text>
            <TextInput
                value={p.value}
                onChangeText={p.onChangeText}
                style={styles.input}
                autoCapitalize={p.autoCapitalize ?? 'sentences'}
                autoComplete={p.autoComplete}
                secureTextEntry={p.secureTextEntry}
                keyboardType={p.keyboardType}
                placeholderTextColor={colors.textMuted}
            />
        </View>
    );
}

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
    flex: { flex: 1 },
    title: {
        fontSize: typography.sizes.xxl,
        color: colors.text,
        fontWeight: typography.weights.bold,
    },
    subtitle: {
        fontSize: typography.sizes.md,
        color: colors.textDim,
        marginTop: spacing.xs,
    },
    form: {
        marginTop: spacing.xxl,
        gap: spacing.lg,
    },
    field: { gap: spacing.xs },
    label: { color: colors.textDim, fontSize: typography.sizes.sm },
    input: {
        backgroundColor: colors.surfaceElevated,
        color: colors.text,
        height: 52,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: typography.sizes.md,
    },
    actions: { gap: spacing.sm, marginBottom: spacing.lg },
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
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
}));
