import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography, radius, spacing } from '../../theme/typography';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
    label: string;
    onPress: () => void;
    variant?: Variant;
    busy?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

export const Button: React.FC<Props> = ({
    label,
    onPress,
    variant = 'primary',
    busy,
    disabled,
    style,
}) => {
    const isDisabled = disabled || busy;
    return (
        <Pressable
            onPress={onPress}
            disabled={isDisabled}
            style={({ pressed }) => [
                styles.base,
                variantStyles[variant],
                pressed && !isDisabled ? { opacity: 0.85 } : null,
                isDisabled ? { opacity: 0.5 } : null,
                style,
            ]}
        >
            {busy ? (
                <ActivityIndicator color={textColor[variant]} />
            ) : (
                <Text style={[styles.label, { color: textColor[variant] }]} allowFontScaling={false}>
                    {label}
                </Text>
            )}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    base: {
        height: 52,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontWeight: typography.weights.bold,
        fontSize: typography.sizes.md,
        letterSpacing: 0.5,
    },
});

const variantStyles: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.danger },
};

const textColor: Record<Variant, string> = {
    primary: '#0F1115',
    secondary: colors.text,
    ghost: colors.textDim,
    danger: '#FFFFFF',
};
