const DAY = 24 * 60 * 60 * 1000;

/** The period a summary covers: the last day, or the last 7 days (Roadmap TASK-42). */
export type SummaryPeriod = 'DAILY' | 'WEEKLY';

/** The weekday a weekly summary is made on: Monday, so it covers the week that just ended. */
const WEEKLY_DAY_UTC = 1;

/**
 * The summary a person is due on this day, if any: a daily one every day, a weekly one on Mondays (UTC), none for
 * a person who chose none.
 */
export function summaryDueOn(
  frequency: 'NONE' | 'DAILY' | 'WEEKLY',
  now: Date,
): SummaryPeriod | null {
  if (frequency === 'DAILY') {
    return 'DAILY';
  }
  if (frequency === 'WEEKLY' && now.getUTCDay() === WEEKLY_DAY_UTC) {
    return 'WEEKLY';
  }
  return null;
}

/** Where the news of a summary starts: a day, or 7 days, before it is made. */
export function periodStart(period: SummaryPeriod, now: Date): Date {
  return new Date(now.getTime() - (period === 'DAILY' ? 1 : 7) * DAY);
}

/** Midnight UTC of the day `now` is in: a summary made at or after it is today's. */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
