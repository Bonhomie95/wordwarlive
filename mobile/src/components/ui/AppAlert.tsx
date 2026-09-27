// Themed replacement for React Native's Alert.alert — same call signature,
// neon card styling that matches the rest of the game.
//
//   appAlert('Title', 'Message', [{ text: 'Cancel', style: 'cancel' }, { text: 'OK', onPress }])
//
// <AlertHost/> is mounted once in the root layout and presents in its own
// transparent <Modal>. iOS can't present a second sheet from a screen that is
// already showing one, so every native <Modal> that can raise a message also
// renders <AlertHost scoped/> inside itself; while any scoped host is mounted
// the root host stands down and the popup draws inside the open sheet.
// Alerts raised while one is open are queued.

import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { create } from 'zustand';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';
import { glow } from '../../theme/effects';

export interface AppAlertButton {
    text?: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress?: () => void;
}

interface AlertItem {
    id: number;
    title: string;
    message?: string;
    buttons: AppAlertButton[];
    cancelable: boolean;
}

const useAlerts = create<{ queue: AlertItem[]; scoped: number }>(() => ({ queue: [], scoped: 0 }));
let nextId = 1;

export function appAlert(
    title: string,
    message?: string,
    buttons?: AppAlertButton[],
    options?: { cancelable?: boolean }
): void {
    const item: AlertItem = {
        id: nextId++,
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
        cancelable: options?.cancelable ?? false,
    };
    useAlerts.setState((s) => ({ queue: [...s.queue, item] }));
}

function dismiss(id: number) {
    useAlerts.setState((s) => ({ queue: s.queue.filter((a) => a.id !== id) }));
}

function iconFor(buttons: AppAlertButton[]): keyof typeof Ionicons.glyphMap {
    return buttons.some((b) => b.style === 'destructive') ? 'warning' : 'flash';
}

export function AlertHost({ scoped = false }: { scoped?: boolean }) {
    const current = useAlerts((s) => s.queue[0]);
    const scopedCount = useAlerts((s) => s.scoped);
    useEffect(() => {
        if (!scoped) return;
        useAlerts.setState((s) => ({ scoped: s.scoped + 1 }));
        return () => useAlerts.setState((s) => ({ scoped: s.scoped - 1 }));
    }, [scoped]);
    const active = scoped || scopedCount === 0;
    const [anim] = useState(() => new Animated.Value(0));

    useEffect(() => {
        if (!current || !active) return;
        anim.setValue(0);
        Animated.timing(anim, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [current, active, anim]);

    if (!current || !active) return null;
    const danger = current.buttons.some((b) => b.style === 'destructive');
    const accent = danger ? colors.danger : colors.primary;
    // Primary action last (iOS convention), cancel first.
    const ordered = [...current.buttons].sort(
        (a, b) => Number(b.style === 'cancel') - Number(a.style === 'cancel')
    );
    const stacked = ordered.length > 2 || ordered.some((b) => (b.text ?? '').length > 14);

    const press = (b: AppAlertButton) => {
        dismiss(current.id);
        b.onPress?.();
    };

    const overlay = (
        <View style={styles.backdrop} accessibilityViewIsModal>
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={current.cancelable ? () => dismiss(current.id) : undefined}
                accessible={false}
            />
            <Animated.View
                accessibilityRole="alert"
                style={[
                    styles.card,
                    { borderColor: accent },
                    glow(accent, 24, 0.45),
                    {
                        opacity: anim,
                        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                    },
                ]}
            >
                <View style={[styles.iconWrap, { borderColor: accent }]}>
                    <Ionicons name={iconFor(current.buttons)} size={22} color={accent} />
                </View>
                <Text style={styles.title} allowFontScaling={false}>
                    {current.title}
                </Text>
                {current.message ? (
                    <Text style={styles.message} allowFontScaling={false}>
                        {current.message}
                    </Text>
                ) : null}
                <View style={[styles.buttons, stacked ? styles.buttonsStacked : null]}>
                    {ordered.map((b, i) => {
                        const kind = b.style ?? (i === ordered.length - 1 ? 'default' : 'cancel');
                        const filled = kind !== 'cancel';
                        const bg = kind === 'destructive' ? colors.danger : colors.primary;
                        return (
                            <Pressable
                                key={`${b.text}-${i}`}
                                onPress={() => press(b)}
                                accessibilityRole="button"
                                accessibilityLabel={b.text ?? 'OK'}
                                style={({ pressed }) => [
                                    styles.btn,
                                    stacked ? null : { flex: 1 },
                                    filled ? { backgroundColor: bg } : styles.btnGhost,
                                    pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
                                ]}
                            >
                                <Text
                                    style={[styles.btnText, { color: filled ? colors.bg : colors.text }]}
                                    allowFontScaling={false}
                                    numberOfLines={1}
                                >
                                    {b.text ?? 'OK'}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </Animated.View>
        </View>
    );
    if (scoped) return overlay;
    return (
        <Modal
            visible
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={() => {
                const cancel = current.buttons.find((b) => b.style === 'cancel');
                if (cancel || current.cancelable) press(cancel ?? {});
            }}
        >
            {overlay}
        </Modal>
    );
}

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        backdrop: {
            ...StyleSheet.absoluteFill,
            backgroundColor: 'rgba(0,0,0,0.72)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.lg,
            zIndex: 10000,
            elevation: 10000,
        },
        card: {
            width: '100%',
            maxWidth: 360,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            padding: spacing.lg,
            alignItems: 'center',
            gap: spacing.sm,
        },
        iconWrap: {
            width: 44,
            height: 44,
            borderRadius: 22,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceElevated,
            marginBottom: spacing.xs,
        },
        title: {
            color: colors.text,
            fontFamily: typography.familyDisplay,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.bold,
            textAlign: 'center',
        },
        message: {
            color: colors.textDim,
            fontSize: typography.sizes.sm,
            lineHeight: 20,
            textAlign: 'center',
        },
        buttons: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.md },
        buttonsStacked: { flexDirection: 'column-reverse' },
        btn: {
            height: 46,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
        },
        btnGhost: {
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
        },
        btnText: {
            fontFamily: typography.familyDisplay,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.bold,
        },
    })
);
