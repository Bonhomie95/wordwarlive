// Store rating prompt. Uses the stores' own rating sheet (StoreKit / Play
// In-App Review): Apple forbids custom review prompts and Google forbids
// asking "do you like the app?" first, and neither tells the app whether the
// player rated or dismissed. So the schedule is the only control:
//   first ask   once the app is 3+ days old OR opened 3+ times,
//   then        no sooner than 1 week later,
//   then        no sooner than 2 weeks after that, and never again.
// Asked only after a win, never right after an ad.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { track } from '../observability';

const KEY = 'wordwar.review';
const DAY = 86_400_000;
const GAPS_AFTER_ASK = [7 * DAY, 14 * DAY]; // after the 1st and 2nd ask
const MAX_ASKS = 3;

interface State {
    firstOpenAt: number;
    opens: number;
    asks: number;
    nextAt: number;
}

async function load(): Promise<State> {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) return JSON.parse(raw) as State;
    } catch {
        // fall through to a fresh state
    }
    return { firstOpenAt: Date.now(), opens: 0, asks: 0, nextAt: 0 };
}

const save = (s: State) => AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});

/** Count an app launch (call once per cold start). */
export async function recordAppOpen(): Promise<void> {
    const s = await load();
    s.opens += 1;
    await save(s);
}

/** Pure schedule check (exported for the self-test below). */
export function shouldAsk(s: State, now: number): boolean {
    if (s.asks >= MAX_ASKS || now < s.nextAt) return false;
    return s.asks > 0 || now - s.firstOpenAt >= 3 * DAY || s.opens >= 3;
}

/** After a win: show the store's rating sheet if the schedule allows. */
export async function maybeAskForReview(): Promise<void> {
    try {
        const s = await load();
        const now = Date.now();
        if (!shouldAsk(s, now)) return;
        if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
        s.asks += 1;
        s.nextAt = s.asks < MAX_ASKS ? now + GAPS_AFTER_ASK[s.asks - 1]! : Number.MAX_SAFE_INTEGER;
        await save(s);
        track('review_prompt', { offer: String(s.asks) });
        await StoreReview.requestReview();
    } catch {
        // never let a rating prompt break the post-game screen
    }
}
