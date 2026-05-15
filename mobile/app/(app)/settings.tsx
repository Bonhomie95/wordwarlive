// Settings screen. Toggles for sound/haptics/color-blind mode plus the
// theme picker. Theme changes apply instantly (mutates the shared colors
// object); the user sees the entire app re-skin without restarting.
//
// Free themes apply immediately. Premium themes are gated — if the user
// doesn't own the cosmetic for that theme, tapping it routes them to
// the shop.

import { useEffect, useState } from 'react';
import {
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
import { settingsApi, type UserSettings } from '../../src/api/resources';
import {
    colors,
    THEME_CATALOG,
    useThemeStore,
    type ThemeId,
} from '../../src/theme/colors';
import { typography, radius, spacing } from '../../src/theme/typography';

const THEME_STORAGE_KEY = 'wordwar.theme';

export default function SettingsScreen() {
    const router = useRouter();
    const signOut = useAuthStore((s) => s.signOut);
    const currentTheme = useThemeStore((s) => s.currentTheme);
    const applyTheme = useThemeStore((s) => s.applyTheme);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        settingsApi.get().then(setSettings).catch(() => {});
    }, []);

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
        try {
            const updated = await settingsApi.update({ [key]: value });
            setSettings(updated);
        } catch {
            setSettings(prev);
        } finally {
            setSaving(false);
        }
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
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Pressable
                        onPress={() => router.back()}
                        hitSlop={12}
                        style={styles.backBtn}
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

                {/* ─── Audio / feedback ─────────────────────────────────── */}
                <SectionHeader label="Audio &amp; Feedback" />
                <ToggleRow
                    label="Sound effects"
                    description="Tile reveals, victory chimes, button taps."
                    value={settings?.sound ?? true}
                    onValueChange={(v) => updateSetting('sound', v)}
                    disabled={saving || !settings}
                />
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
                    onPress={() => signOut()}
                    style={({ pressed }) => [
                        styles.logoutBtn,
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

const styles = StyleSheet.create({
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
});
