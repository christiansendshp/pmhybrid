import { describe, expect, it } from 'vitest';
import {
  periodStart,
  startOfUtcDay,
  summaryDueOn,
} from './period-summary.util.js';

// 2026-11-02 is a Monday; 2026-11-03 a Tuesday.
const MONDAY = new Date('2026-11-02T07:00:00Z');
const TUESDAY = new Date('2026-11-03T07:00:00Z');
const SUNDAY = new Date('2026-11-01T23:30:00Z');

describe('summaryDueOn (Roadmap TASK-42)', () => {
  it.each([
    ['a Monday', MONDAY],
    ['a Tuesday', TUESDAY],
    ['a Sunday', SUNDAY],
  ])('gives a daily summary on %s', (_day, now) => {
    expect(summaryDueOn('DAILY', now)).toBe('DAILY');
  });

  it('gives a weekly summary on Monday', () => {
    expect(summaryDueOn('WEEKLY', MONDAY)).toBe('WEEKLY');
  });

  it.each([
    ['a Tuesday', TUESDAY],
    ['a Sunday', SUNDAY],
  ])('gives no weekly summary on %s', (_day, now) => {
    expect(summaryDueOn('WEEKLY', now)).toBeNull();
  });

  it.each([
    ['a Monday', MONDAY],
    ['a Tuesday', TUESDAY],
  ])('gives nothing to a person who chose none on %s', (_day, now) => {
    expect(summaryDueOn('NONE', now)).toBeNull();
  });

  it('reads the weekday in UTC: late on a Sunday in UTC is not Monday anywhere', () => {
    expect(summaryDueOn('WEEKLY', new Date('2026-11-01T23:59:59Z'))).toBeNull();
  });
});

describe('periodStart', () => {
  it('starts a daily summary a day back', () => {
    expect(periodStart('DAILY', MONDAY).toISOString()).toBe(
      '2026-11-01T07:00:00.000Z',
    );
  });

  it('starts a weekly summary 7 days back', () => {
    expect(periodStart('WEEKLY', MONDAY).toISOString()).toBe(
      '2026-10-26T07:00:00.000Z',
    );
  });
});

describe('startOfUtcDay', () => {
  it('is midnight UTC of the day', () => {
    expect(startOfUtcDay(MONDAY).toISOString()).toBe(
      '2026-11-02T00:00:00.000Z',
    );
  });

  it('keeps midnight itself, and the last moment of the day, in their day', () => {
    expect([
      startOfUtcDay(new Date('2026-11-02T00:00:00.000Z')).toISOString(),
      startOfUtcDay(new Date('2026-11-02T23:59:59.999Z')).toISOString(),
    ]).toEqual(['2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z']);
  });
});
