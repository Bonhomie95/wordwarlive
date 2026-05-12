// Toast — a transient, absolutely-positioned message bar. Doesn't take part
// in normal layout, so it can't push the keyboard down. Auto-dismisses after
// `durationMs`; user can also tap "Skip" to dismiss immediately.
//
// Styled differently for 'info' (rewarded events like hint reveal) and
// 'error' (rejected guesses, validation failures).

import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    cancelAnimation,
    runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';

interface Props {
    visible: boolean;
    message: string;
    variant?: 'info' | 'error';
    /** Auto-dismiss after this many ms. Defaults: 3000 for error, 5000 for info. */
    durationMs?: number;
    /** Show a "Skip" button so the user can dismiss before the timer. Default true for info. */
    skippable?: boolean;
    onDismiss: () => void;
    /** Optional accent icon. Defaults to bulb for info, alert for error. */
    icon?: keyof typeof Ionicons.glyphMap;
}

const DEFAULT_DURATION = { info: 5000, error: 3000 };

export const Toast: React.FC<Props> = ({
    visible,
    message,
    variant = 'info',
    durationMs,
    skippable,
    onDismiss,
    icon,
}) => {
    const insets = useSafeAreaInsets();
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(-12);
    // Track the timer so visibility flips before the timer fires don't leak.
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const effectiveDuration = durationMs ?? DEFAULT_DURATION[variant];
    const showSkip = skippable ?? variant === 'info';

    useEffect(() => {
        if (visible) {
            opacity.value = withTiming(1, { duration: 200 });
            translateY.value = withTiming(0, { duration: 200 });
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                onDismiss();
            }, effectiveDuration);
        } else {
            opacity.value = withTiming(0, { duration: 150 });
            translateY.value = withTiming(-12, { duration: 150 });
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            cancelAnimation(opacity);
            cancelAnimation(translateY);
            // Avoid useless ‘set on unmounted’ warnings — runOnJS noop.
            void runOnJS;
        };
    }, [visible, effectiveDuration, opacity, translateY, onDismiss]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    if (!visible) return null;

    const iconName: keyof typeof Ionicons.glyphMap =
        icon ?? (variant === 'error' ? 'alert-circle' : 'bulb');
    const iconColor = variant === 'error' ? colors.danger : colors.warning;
    const borderColor = variant === 'error' ? colors.danger : colors.warning;

    return (
        <Animated.View
            pointerEvents="box-none"
            style={[
                styles.container,
                // Push down past the notch/status-bar. spacing.sm gives the
                // toast a little breathing room below the safe area.
                { top: insets.top + spacing.sm },
                animatedStyle,
            ]}
        >
            <View style={[styles.toast, { borderColor }]} pointerEvents="auto">
                <Ionicons name={iconName} size={18} color={iconColor} />
                <Text style={styles.message} numberOfLines={2} allowFontScaling={false}>
                    {message}
                </Text>
                {showSkip ? (
                    <Pressable
                        onPress={onDismiss}
                        hitSlop={8}
                        style={({ pressed }) => [
                            styles.skipBtn,
                            pressed ? { opacity: 0.7 } : null,
                        ]}
                    >
                        <Text style={styles.skipText} allowFontScaling={false}>
                            SKIP
                        </Text>
                    </Pressable>
                ) : null}
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        // top is set dynamically from the safe-area inset.
        left: spacing.md,
        right: spacing.md,
        zIndex: 50,
        elevation: 50,
        alignItems: 'center',
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        // Mild drop shadow so the toast lifts off the page on lighter themes.
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        maxWidth: 440,
    },
    message: {
        flex: 1,
        color: colors.text,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
    },
    skipBtn: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    skipText: {
        color: colors.textDim,
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: typography.weights.bold,
    },
});
