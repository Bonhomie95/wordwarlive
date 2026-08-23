// Root error boundary. Without this, any render-time exception in the tree
// unmounts everything and leaves a permanent white/blank screen with no way
// out. This catches it, reports it, and shows a recoverable fallback so the
// user can retry instead of force-quitting.

import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { captureError } from '../observability';
import { makeThemedStyles, colors } from '../theme/colors';
import { typography, radius, spacing } from '../theme/typography';

interface Props {
    children: React.ReactNode;
}
interface State {
    hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        captureError(error, { componentStack: info.componentStack });
    }

    private reset = () => this.setState({ hasError: false });

    render(): React.ReactNode {
        if (!this.state.hasError) return this.props.children;
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Something went wrong</Text>
                <Text style={styles.body}>
                    The app hit an unexpected error. You can try again.
                </Text>
                <Pressable
                    style={styles.button}
                    onPress={this.reset}
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                >
                    <Text style={styles.buttonText}>Try again</Text>
                </Pressable>
            </View>
        );
    }
}

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.xl,
            gap: spacing.md,
        },
        title: {
            color: colors.text,
            fontFamily: typography.family,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
        },
        body: {
            color: colors.textDim,
            fontFamily: typography.family,
            fontSize: typography.sizes.md,
            textAlign: 'center',
        },
        button: {
            marginTop: spacing.md,
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
        },
        buttonText: {
            color: '#0F1115',
            fontFamily: typography.family,
            fontSize: typography.sizes.md,
            fontWeight: typography.weights.bold,
        },
    })
);
