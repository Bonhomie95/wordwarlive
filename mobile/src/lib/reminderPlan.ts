// Pure reminder planning (no native imports, so it can be tested in Node).
// See reminders.ts for the rules and the scheduling.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Reminder {
    id: string;
    at: number;
    title: string;
    body: string;
}

export interface ReminderState {
    playStreak: number;
    /** YYYY-MM-DD (UTC) of the last finished match, or null. */
    lastPlayDate: string | null;
    /** ISO time of the last Daily Bonus claim, or null. */
    lastDailyAdAt: string | null;
}

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const nextUtcMidnight = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};
const quiet = (t: number) => {
    const h = new Date(t).getHours();
    return h >= 22 || h < 8;
};
/** Move a time earlier until it is outside local quiet hours (max 14 h back). */
function beforeQuiet(t: number): number {
    for (let i = 0; i < 28 && quiet(t); i++) t -= 30 * 60_000;
    return t;
}
/** Local wall-clock time `days` from now's date at `hour`:00. */
function localAt(now: number, days: number, hour: number): number {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour, 0, 0, 0).getTime();
}
const localDay = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Pure plan of the reminders to schedule from `now` (exported for tests). */
export function planReminders(now: number, s: ReminderState): Reminder[] {
    const candidates: Reminder[] = [];
    const today = utcDay(now);
    const playedToday = s.lastPlayDate === today;

    // 1. Streak about to end: the UTC day it must be extended by closes at
    //    00:00 UTC; remind ~3 h before, moved out of the night.
    if (s.playStreak >= 2) {
        const deadline = playedToday ? nextUtcMidnight(now) + DAY : nextUtcMidnight(now);
        candidates.push({
            id: 'streak',
            at: beforeQuiet(deadline - 3 * HOUR),
            title: `🔥 Your ${s.playStreak}-day streak is on the line`,
            body: 'One match before midnight UTC keeps it going (and pays your daily streak coins).',
        });
    }
    // 2. Weekly leaderboard closes Monday 00:00 UTC (only for recent players).
    const recent = s.lastPlayDate && now - Date.parse(`${s.lastPlayDate}T00:00:00Z`) < 7 * DAY;
    if (recent) {
        const d = new Date(now);
        const daysToMonday = (8 - d.getUTCDay()) % 7 || 7;
        const close = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysToMonday);
        candidates.push({
            id: 'weekly',
            at: beforeQuiet(close - 3 * HOUR),
            title: '⏳ The weekly leaderboard closes soon',
            body: 'The top 100 win coins, up to 400 for 1st. A few wins could move you up.',
        });
    }
    // 3. Daily Bonus is ready again tomorrow morning (if claimed today).
    if (s.lastDailyAdAt && localDay(Date.parse(s.lastDailyAdAt)) === localDay(now)) {
        candidates.push({
            id: 'bonus',
            at: localAt(now, 1, 10),
            title: '🎁 Your Daily Bonus is ready',
            body: 'Watch a short ad for +30 coins, Pass XP and a power-up.',
        });
    }
    // 4. Come back after three days away (moved forward each time they open).
    candidates.push({
        id: 'comeback',
        at: localAt(now, 3, 18),
        title: '⚔️ Your next rival is waiting',
        body: 'Jump into a quick 1v1 word duel and climb the leaderboard.',
    });

    // Keep the highest priority per local day; drop past or too-soon times.
    const taken = new Set<string>();
    const plan: Reminder[] = [];
    for (const r of candidates) {
        if (r.at < now + 10 * 60_000) continue;
        const day = localDay(r.at);
        if (taken.has(day)) continue;
        taken.add(day);
        plan.push(r);
    }
    return plan;
}
