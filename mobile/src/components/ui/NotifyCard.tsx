// Home-screen opt-in for notifications. Until 1.0.5 the app only asked on
// the Friends screen, so most players never allowed notifications and never
// heard about leaderboard results. Shown once a player has finished a match
// and the system prompt hasn't been answered; "Not now" hides it for 3 days.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Button } from './Button';
import { registerForPush } from '../../lib/notifications';
import { rescheduleReminders } from '../../lib/reminders';
import { track } from '../../observability';
import type { MeResponse } from '../../types/index';
import { makeThemedStyles, colors } from '../../theme/colors';
import { typography, spacing, radius } from '../../theme/typography';

const SNOOZE_KEY = 'wordwar.notifyCardSnoozedUntil';

export const NotifyCard: React.FC<{ me: MeResponse }> = ({ me }) => {
    const [show, setShow] = useState(false);
    const played = me.wins + me.losses > 0;

    useEffect(() => {
        if (!played) return;
        let alive = true;
        Promise.all([Notifications.getPermissionsAsync(), AsyncStorage.getItem(SNOOZE_KEY)])
            .then(([perm, until]) => {
                if (alive) setShow(perm.status === 'undetermined' && perm.canAskAgain && Number(until ?? 0) < Date.now());
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [played]);

    if (!show) return null;

    async function onEnable() {
        setShow(false);
        await registerForPush({ prompt: true });
        const perm = await Notifications.getPermissionsAsync().catch(() => null);
        const granted = perm?.status === 'granted';
        track('notify_prompt', { offer: granted ? 'granted' : 'denied' });
        if (granted) await rescheduleReminders(me);
    }

    function onLater() {
        setShow(false);
        track('notify_prompt', { offer: 'later' });
        AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + 3 * 86_400_000)).catch(() => {});
    }

    return (
        <View style={styles.card}>
            <View style={styles.head}>
                <Ionicons name="notifications" size={18} color={colors.primary} />
                <Text style={styles.title} allowFontScaling={false}>
                    Don&apos;t miss your prizes
                </Text>
            </View>
            <Text style={styles.body} allowFontScaling={false}>
                Get a heads-up when leaderboard results are in, when a friend challenges you, and before your
                streak runs out.
            </Text>
            <View style={styles.row}>
                <Button label="Turn on" icon="notifications-outline" onPress={onEnable} style={styles.btn} />
                <Button label="Not now" variant="ghost" onPress={onLater} style={styles.btn} />
            </View>
        </View>
    );
};

const styles = makeThemedStyles(() =>
    StyleSheet.create({
        card: {
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.surface,
        },
        head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        title: { color: colors.text, fontFamily: typography.familyDisplay, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
        body: { color: colors.textDim, fontFamily: typography.familyMono, fontSize: typography.sizes.xs, lineHeight: 17 },
        row: { flexDirection: 'row', gap: spacing.sm },
        btn: { flex: 1, height: 44 },
    })
);
