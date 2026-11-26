// Local reminder notifications: scheduled on the phone, so they work on both
// platforms without push keys. Rebuilt every time the app opens, so they
// always match the player's current state, and capped so they never spam:
//   · at most one reminder per local day, never 22:00–08:00 local
//   · priority: streak about to end > weekly board closing > Daily Bonus
//     ready > come back after 3 days away
// Off with Settings → Reminders. Cleared on sign-out.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { MeResponse } from '../types/index';
import { planReminders } from './reminderPlan';

export { planReminders } from './reminderPlan';

const ENABLED_KEY = 'wordwar.reminders';
const ID_PREFIX = 'ww-reminder-';
const CHANNEL = 'reminders';

export async function remindersEnabled(): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(ENABLED_KEY)) !== '0';
    } catch {
        return true;
    }
}

export async function setRemindersEnabled(on: boolean, me?: MeResponse | null): Promise<void> {
    await AsyncStorage.setItem(ENABLED_KEY, on ? '1' : '0').catch(() => {});
    if (on && me) await rescheduleReminders(me);
    else await cancelReminders();
}

export async function cancelReminders(): Promise<void> {
    try {
        const all = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(all.filter((n) => n.identifier.startsWith(ID_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    } catch {
        // no native module (Expo Go) / nothing scheduled
    }
}

/** Replace our scheduled reminders with a fresh plan. Never prompts. */
export async function rescheduleReminders(me: MeResponse): Promise<void> {
    try {
        if (!(await remindersEnabled())) return;
        const perm = await Notifications.getPermissionsAsync();
        if (perm.status !== 'granted') return;
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
        }
        await cancelReminders();
        const plan = planReminders(Date.now(), {
            playStreak: me.streak.playStreak,
            lastPlayDate: me.streak.lastPlayDate,
            lastDailyAdAt: me.ads.lastDailyAdAt,
        });
        for (const r of plan) {
            await Notifications.scheduleNotificationAsync({
                identifier: ID_PREFIX + r.id,
                content: { title: r.title, body: r.body, data: { type: 'reminder', kind: r.id }, sound: 'default' },
                trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
            });
        }
    } catch {
        // best-effort: a reminder must never break the app
    }
}
