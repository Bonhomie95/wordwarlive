import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';
import { glow } from '../../theme/effects';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
    label: string;
    onPress: () => void;
    variant?: Variant;
    busy?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    /** Optional leading Ionicons glyph, e.g. 'share-social'. */
    icon?: keyof typeof Ionicons.glyphMap;
}

export const Button: React.FC<Props> = ({
    label,
    onPress,
    variant = 'primary',
    busy,
    disabled,
    style,
    icon,
}) => {
    const isDisabled = disabled || busy;
    return (
        <Pressable
            onPress={onPress}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
            style={({ pressed }) => [
                styles.base,
                variantStyles[variant],
                variant === 'primary' && !isDisabled ? glow(colors.primary, 16, 0.5) : null,
                pressed && !isDisabled ? { opacity: 0.9, transform: [{ scale: 0.98 }] } : null,
                isDisabled ? { opacity: 0.45 } : null,
                style,
            ]}
        >
            {busy ? (
                <ActivityIndicator color={textColor(variant)} />
            ) : (
                <View style={styles.content}>
                    {icon ? (
                        <Ionicons name={icon} size={18} color={textColor(variant)} />
                    ) : null}
                    <Text
                        style={[styles.label, { color: textColor(variant) }]}
                        allowFontScaling={false}
                    >
                        {label}
                    </Text>
                </View>
            )}
        </Pressable>
    );
};

function textColor(variant: Variant): string {
    switch (variant) {
        case 'primary':
            return colors.bg;
        case 'secondary':
            return colors.text;
        case 'ghost':
            return colors.textDim;
        case 'danger':
            return colors.danger;
    }
}

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        base: {
            height: 54,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
        },
        label: {
            fontFamily: typography.familyDisplay,
            fontWeight: typography.weights.bold,
            fontSize: typography.sizes.md,
            letterSpacing: 0.5,
        },
        content: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
        },
    })
);

const variantStyles: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: colors.primary },
    secondary: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
    },
    ghost: { backgroundColor: 'transparent' },
    danger: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: colors.danger,
    },
};
