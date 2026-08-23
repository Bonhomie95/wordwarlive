// Settings screen. Toggles for sound/haptics/color-blind mode plus the
// theme picker. Theme changes apply instantly (mutates the shared colors
// object); the user sees the entire app re-skin without restarting.
//
// Free themes apply immediately. Premium themes are gated — if the user
// doesn't own the cosmetic for that theme, tapping it routes them to
// the shop.

import { useEffect, useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { settingsApi, usersApi, authAccountApi, type UserSettings } from '../../src/api/resources';
import { setHapticsEnabled } from '../../src/lib/haptics';
import { OnboardingModal } from '../../src/components/ui/OnboardingModal';
import { makeThemedStyles,
    colors,
    THEME_CATALOG,
    useThemeStore,
    type ThemeId,
} from '../../src/theme/colors';
import { typography, radius, spacing } from '../../src/theme/typography';

const THEME_STORAGE_KEY = 'wordwar.theme';
const COLOR_BLIND_STORAGE_KEY = 'wordwar.colorblind';

function persistColorBlind(enabled: boolean) {
    SecureStore.setItemAsync(COLOR_BLIND_STORAGE_KEY, enabled ? '1' : '0').catch(
        () => {}
    );
}

export default function SettingsScreen() {
    const router = useRouter();
    const signOut = useAuthStore((s) => s.signOut);
    const applyRotatedToken = useAuthStore((s) => s.applyRotatedToken);

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete account?',
            'This permanently deletes your account, rank, coins, cosmetics, and match history. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await usersApi.deleteAccount();
                        } catch {
                            // Even if the call fails, sign out locally; the
                            // account row may already be gone. Surface a notice.
                            Alert.alert(
                                'Could not delete',
                                'Something went wrong. Please try again.'
                            );
                            return;
                        }
                        await signOut();
                    },
                },
            ]
        );
    };
    const currentTheme = useThemeStore((s) => s.currentTheme);
    const applyTheme = useThemeStore((s) => s.applyTheme);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [showHowToPlay, setShowHowToPlay] = useState(false);

    const setColorBlind = useThemeStore((s) => s.setColorBlind);

    useEffect(() => {
        settingsApi
            .get()
            .then((s) => {
                setSettings(s);
                // Sync the tile palette + haptics with the server-side prefs.
                setColorBlind(s.colorBlindMode);
                persistColorBlind(s.colorBlindMode);
                setHapticsEnabled(s.haptics);
            })
            .catch(() => {});
    }, [setColorBlind]);

    async function updateSetting<K extends keyof UserSettings>(
        key: K,
        value: UserSettings[K]
    ) {
        // Optimistic update — instant feedback. Reverts if server rejects.
        const prev = settings;
        if (!prev) return;
        const next = { ...prev, [key]: value };
        setSettings(next);
        setSaving(true);
        if (key === 'colorBlindMode') {
            // Apply the high-contrast tiles immediately (and remember locally
            // so the next cold launch doesn't flash the default palette).
            setColorBlind(value as boolean);
            persistColorBlind(value as boolean);
        }
        if (key === 'haptics') {
            // Apply immediately so the very next tap reflects the choice.
            setHapticsEnabled(value as boolean);
        }
        try {
            const updated = await settingsApi.update({ [key]: value });
            setSettings(updated);
        } catch {
            setSettings(prev);
            if (key === 'colorBlindMode') {
                setColorBlind(prev.colorBlindMode);
                persistColorBlind(prev.colorBlindMode);
            }
            if (key === 'haptics') setHapticsEnabled(prev.haptics);
        } finally {
            setSaving(false);
        }
    }

    const [loggingOutAll, setLoggingOutAll] = useState(false);
    function onLogoutEverywhere() {
        Alert.alert(
            'Log out of all devices?',
            'This signs you out everywhere. You stay signed in on this device.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log out all',
                    style: 'destructive',
                    onPress: async () => {
                        setLoggingOutAll(true);
                        try {
                            const r = await authAccountApi.logoutEverywhere();
                            // Keep this device signed in with the fresh token —
                            // and rebuild the socket so it uses it.
                            await applyRotatedToken(r.token);
                            Alert.alert('Done', 'All other sessions were signed out.');
                        } catch {
                            Alert.alert('Could not complete', 'Please try again.');
                        } finally {
                            setLoggingOutAll(false);
                        }
                    },
                },
            ]
        );
    }

    async function onPickTheme(themeId: ThemeId) {
        const theme = THEME_CATALOG[themeId];
        if (theme.isPremium && themeId !== currentTheme) {
            // Premium themes are tied to the cosmetic shop. For now we just
            // route to shop; a fuller integration would let the cosmetic
            // unlock the theme.
            router.push('/(app)/shop');
            return;
        }
        applyTheme(themeId);
        // Persist locally so the next launch starts on this theme.
        SecureStore.setItemAsync(THEME_STORAGE_KEY, themeId).catch(() => {});
    }

    return (
        <SafeAreaView style={styles.safe}>
            <OnboardingModal
                visible={showHowToPlay}
                onDone={() => setShowHowToPlay(false)}
            />
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Pressable
                        onPress={() => router.back()}
                        hitSlop={12}
                        style={styles.backBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <Ionicons
                            name="chevron-back"
                            size={24}
                            color={colors.text}
                        />
                    </Pressable>
                    <Text style={styles.title} allowFontScaling={false}>
                        Settings
                    </Text>
                </View>

                {/* ─── Feedback ─────────────────────────────────────────── */}
                <SectionHeader label="Feedback" />
                <ToggleRow
                    label="Haptics"
                    description="Vibration on guesses and important events."
                    value={settings?.haptics ?? true}
                    onValueChange={(v) => updateSetting('haptics', v)}
                    disabled={saving || !settings}
                />
                <ToggleRow
                    label="Color-blind mode"
                    description="Use distinct shapes alongside colors."
                    value={settings?.colorBlindMode ?? false}
                    onValueChange={(v) => updateSetting('colorBlindMode', v)}
                    disabled={saving || !settings}
                />

                {/* ─── Help ─────────────────────────────────────────────── */}
                <SectionHeader label="Help" />
                <Pressable
                    onPress={() => setShowHowToPlay(true)}
                    accessibilityRole="button"
                    accessibilityLabel="How to play"
                    style={({ pressed }) => [
                        styles.row,
                        { justifyContent: 'space-between' },
                        pressed ? { opacity: 0.85 } : null,
                    ]}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={styles.rowLabel} allowFontScaling={false}>
                            How to play
                        </Text>
                        <Text style={styles.rowDesc} allowFontScaling={false}>
                            Replay the tutorial: modes, power-ups, and hints.
                        </Text>
                    </View>
                    <Ionicons name="help-circle-outline" size={22} color={colors.textDim} />
                </Pressable>

                {/* ─── Themes ───────────────────────────────────────────── */}
                <SectionHeader label="Theme" />
                <View style={styles.themeList}>
                    {Object.values(THEME_CATALOG).map((theme) => {
                        const isActive = theme.id === currentTheme;
                        return (
                            <Pressable
                                key={theme.id}
                                onPress={() => onPickTheme(theme.id)}
                                style={({ pressed }) => [
                                    styles.themeCard,
                                    isActive ? styles.themeCardActive : null,
                                    pressed ? { opacity: 0.85 } : null,
                                ]}
                            >
                                {/* Preview swatches — small dots showing the
                                    theme's primary, surface, and tile colors. */}
                                <View style={styles.swatchRow}>
                                    <View
                                        style={[
                                            styles.swatch,
                                            { backgroundColor: theme.tokens.bg },
                                        ]}
                                    />
                                    <View
                                        style={[
                                            styles.swatch,
                                            { backgroundColor: theme.tokens.surface },
                                        ]}
                                    />
                                    <View
                                        style={[
                                            styles.swatch,
                                            { backgroundColor: theme.tokens.tileCorrect },
                                        ]}
                                    />
                                    <View
                                        style={[
                                            styles.swatch,
                                            { backgroundColor: theme.tokens.tileMisplaced },
                                        ]}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={styles.themeNameRow}>
                                        <Text
                                            style={styles.themeName}
                                            allowFontScaling={false}
                                        >
                                            {theme.name}
                                        </Text>
                                        {theme.isPremium ? (
                                            <View style={styles.premiumBadge}>
                                                <Text
                                                    style={styles.premiumBadgeText}
                                                    allowFontScaling={false}
                                                >
                                                    PREMIUM
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                    <Text
                                        style={styles.themeDesc}
                                        allowFontScaling={false}
                                    >
                                        {theme.description}
                                    </Text>
                                </View>
                                {isActive ? (
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={22}
                                        color={colors.primary}
                                    />
                                ) : null}
                            </Pressable>
                        );
                    })}
                </View>

                {/* ─── Account ──────────────────────────────────────────── */}
                <SectionHeader label="Account" />
                <Pressable
                    onPress={onLogoutEverywhere}
                    disabled={loggingOutAll}
                    accessibilityRole="button"
                    accessibilityLabel="Log out of all devices"
                    style={({ pressed }) => [
                        styles.row,
                        { justifyContent: 'space-between' },
                        pressed ? { opacity: 0.85 } : null,
                    ]}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={styles.rowLabel} allowFontScaling={false}>
                            Log out of all devices
                        </Text>
                        <Text style={styles.rowDesc} allowFontScaling={false}>
                            Signs out everywhere; you stay in on this device.
                        </Text>
                    </View>
                    <Ionicons name="shield-outline" size={20} color={colors.textDim} />
                </Pressable>
                <Pressable
                    onPress={() => signOut()}
                    accessibilityRole="button"
                    accessibilityLabel="Sign out"
                    style={({ pressed }) => [
                        styles.logoutBtn,
                        { marginTop: spacing.sm },
                        pressed ? { opacity: 0.85 } : null,
                    ]}
                >
                    <Ionicons
                        name="log-out-outline"
                        size={18}
                        color={colors.danger}
                    />
                    <Text style={styles.logoutText} allowFontScaling={false}>
                        Sign out
                    </Text>
                </Pressable>

                <Pressable
                    onPress={handleDeleteAccount}
                    accessibilityRole="button"
                    accessibilityLabel="Delete account"
                    style={({ pressed }) => [
                        styles.deleteBtn,
                        pressed ? { opacity: 0.85 } : null,
                    ]}
                >
                    <Ionicons
                        name="trash-outline"
                        size={16}
                        color={colors.textMuted}
                    />
                    <Text style={styles.deleteText} allowFontScaling={false}>
                        Delete account
                    </Text>
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
    <Text style={styles.sectionHeader} allowFontScaling={false}>
        {label}
    </Text>
);

const ToggleRow: React.FC<{
    label: string;
    description: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
    disabled?: boolean;
}> = ({ label, description, value, onValueChange, disabled }) => (
    <View style={styles.row}>
        <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel} allowFontScaling={false}>
                {label}
            </Text>
            <Text style={styles.rowDesc} allowFontScaling={false}>
                {description}
            </Text>
        </View>
        <Switch
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            trackColor={{ false: colors.border, true: colors.primaryDim }}
            thumbColor={value ? colors.primary : colors.textMuted}
        />
    </View>
);

const styles = makeThemedStyles(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    backBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: colors.text,
        fontSize: typography.sizes.xxl,
        fontWeight: typography.weights.black,
    },
    sectionHeader: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.bold,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        padding: spacing.md,
        marginBottom: spacing.xs,
        borderWidth: 1,
        borderColor: colors.border,
    },
    rowLabel: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
    },
    rowDesc: {
        color: colors.textMuted,
        fontSize: typography.sizes.xs,
        marginTop: 2,
    },
    themeList: { gap: spacing.sm },
    themeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    themeCardActive: {
        borderColor: colors.primary,
        backgroundColor: colors.surfaceElevated,
    },
    swatchRow: {
        flexDirection: 'row',
        gap: 4,
        width: 76,
        flexWrap: 'wrap',
    },
    swatch: {
        width: 36,
        height: 16,
        borderRadius: 3,
        borderWidth: 1,
        borderColor: colors.border,
    },
    themeNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    themeName: {
        color: colors.text,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.bold,
    },
    premiumBadge: {
        backgroundColor: colors.warning,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    premiumBadgeText: {
        color: colors.bg,
        fontSize: 9,
        fontWeight: typography.weights.black,
        letterSpacing: 0.5,
    },
    themeDesc: {
        color: colors.textDim,
        fontSize: typography.sizes.xs,
        marginTop: 2,
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.danger,
    },
    logoutText: {
        color: colors.danger,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        marginTop: spacing.md,
        padding: spacing.sm,
    },
    deleteText: {
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.medium,
    },
}));
