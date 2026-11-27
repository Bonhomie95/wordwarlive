// Bottom sheet: a card that slides up over a dimmed backdrop. Tap outside or
// the close button to dismiss. Used for the rank ladder and the stats sheet.

import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

export const Sheet: React.FC<{
    visible: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}> = ({ visible, title, onClose, children }) => {
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.root}>
                <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
                <View style={[styles.card, { paddingBottom: insets.bottom + spacing.lg }]}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title} allowFontScaling={false}>
                            {title}
                        </Text>
                        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                            <Ionicons name="close" size={22} color={colors.textMuted} />
                        </Pressable>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
                        {children}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        root: { flex: 1, justifyContent: 'flex-end' },
        backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
        card: {
            maxHeight: '86%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
        },
        handle: {
            alignSelf: 'center',
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            marginBottom: spacing.sm,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.md,
        },
        title: {
            color: colors.text,
            fontFamily: typography.familyDisplay,
            fontWeight: typography.weights.black,
            fontSize: typography.sizes.lg,
            letterSpacing: 0.5,
        },
        body: { gap: spacing.md, paddingBottom: spacing.sm },
    })
);
