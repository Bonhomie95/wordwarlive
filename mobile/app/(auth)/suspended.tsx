import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/ui/Screen';
import { Button } from '../../src/components/ui/Button';
import { MonoLabel } from '../../src/components/ui/primitives';
import { useAuthStore } from '../../src/store/authStore';
import { makeThemedStyles, colors } from '../../src/theme/colors';
import { typography, spacing, radius } from '../../src/theme/typography';

const SUPPORT_EMAIL = 'support@wordwar.app';

export default function Suspended() {
    const message = useAuthStore((s) => s.suspendedMessage);
    const signOut = useAuthStore((s) => s.signOut);

    function contactSupport() {
        Linking.openURL(
            `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('WordWar account appeal')}`
        ).catch(() => {});
    }

    return (
        <Screen noGlow>
            <View style={styles.container}>
                <View style={styles.body}>
                    <View style={styles.badge}>
                        <Ionicons name="ban" size={40} color={colors.danger} />
                    </View>
                    <MonoLabel size={11} style={styles.kicker}>
                        ACCOUNT SUSPENDED
                    </MonoLabel>
                    <MonoLabel size={15} style={styles.message}>
                        {message ?? 'This account has been suspended.'}
                    </MonoLabel>
                    <MonoLabel size={12} style={styles.detail}>
                        Access to matches, the shop, and your profile is disabled while your
                        account is suspended. If you believe this was a mistake, contact
                        support and we'll review it.
                    </MonoLabel>
                </View>

                <View style={styles.actions}>
                    <Button
                        label="Contact support"
                        onPress={contactSupport}
                        variant="secondary"
                        icon="mail-outline"
                    />
                    <Button label="Back to sign in" onPress={() => void signOut()} variant="ghost" />
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
        body: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
        },
        badge: {
            width: 84,
            height: 84,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.danger,
            marginBottom: spacing.sm,
        },
        kicker: {
            color: colors.danger,
            letterSpacing: 2,
        },
        message: {
            color: colors.text,
            textAlign: 'center',
            fontFamily: typography.familyMono,
        },
        detail: {
            color: colors.textDim,
            textAlign: 'center',
            lineHeight: 20,
            marginTop: spacing.xs,
        },
        actions: {
            gap: spacing.sm,
            paddingBottom: spacing.xl,
        },
    })
);
