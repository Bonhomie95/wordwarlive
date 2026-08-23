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
import { Button } from '../../src/components/ui/Button';
import { Screen } from '../../src/components/ui/Screen';
import { useAuthStore } from '../../src/store/authStore';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

export default function Login() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const signInEmail = useAuthStore((s) => s.signInEmail);
    const busy = useAuthStore((s) => s.busy);

    async function onSubmit() {
        if (!email || !password) {
            Alert.alert('Missing fields', 'Enter your email and password.');
            return;
        }
        try {
            await signInEmail(email, password);
        } catch (err) {
            Alert.alert('Sign-in failed', err instanceof Error ? err.message : 'Try again.');
        }
    }

    return (
        <Screen>
            <KeyboardAvoidingView
                style={styles.kav}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.flex}>
                    <Text style={styles.title} allowFontScaling={false}>Sign in</Text>
                    <Text style={styles.subtitle} allowFontScaling={false}>
                        Welcome back.
                    </Text>

                    <View style={styles.form}>
                        <Field
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            autoComplete="email"
                            keyboardType="email-address"
                        />
                        <Field
                            label="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoComplete="password"
                        />
                    </View>
                </View>

                <View style={styles.actions}>
                    <Button label="Sign in" onPress={onSubmit} busy={busy} />
                    <Button
                        label="Back"
                        onPress={() => router.back()}
                        variant="ghost"
                    />
                </View>
            </KeyboardAvoidingView>
        </Screen>
    );
}

interface FieldProps {
    label: string;
    value: string;
    onChangeText: (s: string) => void;
    secureTextEntry?: boolean;
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    autoComplete?: 'email' | 'password' | 'username' | 'off';
    keyboardType?: 'default' | 'email-address';
}

function Field(p: FieldProps) {
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
    kav: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
    flex: { flex: 1 },
    title: {
        fontFamily: typography.familyDisplay,
        fontSize: typography.sizes.xxl,
        color: colors.text,
        fontWeight: typography.weights.black,
        letterSpacing: 0.5,
    },
    subtitle: {
        fontFamily: typography.familyMono,
        fontSize: typography.sizes.sm,
        color: colors.textDim,
        marginTop: spacing.xs,
    },
    form: {
        marginTop: spacing.xxl,
        gap: spacing.lg,
    },
    field: { gap: spacing.xs },
    label: {
        color: colors.textDim,
        fontFamily: typography.familyMono,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    input: {
        backgroundColor: colors.surfaceElevated,
        color: colors.text,
        height: 52,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        fontFamily: typography.family,
        fontSize: typography.sizes.md,
    },
    actions: {
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
}));
