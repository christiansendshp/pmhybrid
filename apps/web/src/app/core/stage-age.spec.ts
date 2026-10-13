import { describe, expect, it } from 'vitest';
import { elapsedText, stageAgeText } from './stage-age.js';

const NOW = new Date('2026-10-14T00:30:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('elapsedText (Roadmap TASK-13)', () => {
  it('picks the unit that fits and rounds down', () => {
    expect(elapsedText(ago(10_000), NOW)).toBe('ahora');
    expect(elapsedText(ago(59 * MIN + 59_000), NOW)).toBe('hace 59 min');
    expect(elapsedText(ago(5 * MIN), NOW)).toBe('hace 5 min');
    expect(elapsedText(ago(HOUR), NOW)).toBe('hace 1 h');
    expect(elapsedText(ago(23 * HOUR + 59 * MIN), NOW)).toBe('hace 23 h');
    expect(elapsedText(ago(DAY), NOW)).toBe('hace 1 d');
    expect(elapsedText(ago(2 * DAY + 5 * HOUR), NOW)).toBe('hace 2 d');
    expect(elapsedText(ago(45 * DAY), NOW)).toBe('hace 45 d');
  });

  it('counts elapsed time, so a day boundary and a time zone change nothing', () => {
    // 23 h 50 min ago crosses local midnight in most zones and is still hours, not "1 d".
    expect(elapsedText(ago(23 * HOUR + 50 * MIN), NOW)).toBe('hace 23 h');
    // The same two instants, written in different offsets, are the same age.
    expect(elapsedText('2026-10-13T00:30:00Z', NOW)).toBe('hace 1 d');
    expect(elapsedText('2026-10-12T21:30:00-03:00', NOW)).toBe('hace 1 d');
    expect(elapsedText('2026-10-13T09:30:00+09:00', NOW)).toBe('hace 1 d');
  });

  it('reads a time in the future (a clock that is ahead) as now', () => {
    expect(elapsedText(new Date(NOW.getTime() + 5 * MIN), NOW)).toBe('ahora');
  });

  it('accepts a Date as well as a string', () => {
    expect(elapsedText(new Date(NOW.getTime() - 3 * HOUR), NOW)).toBe('hace 3 h');
  });
});

describe('stageAgeText', () => {
  it('says the stage with the time in it', () => {
    expect(stageAgeText('QA', ago(2 * DAY), NOW)).toBe('en QA hace 2 d');
    expect(stageAgeText('EN_DESARROLLO', ago(3 * HOUR), NOW)).toBe('en desarrollo hace 3 h');
    expect(stageAgeText('PENDIENTE', ago(40 * DAY), NOW)).toBe('pendiente hace 40 d');
    expect(stageAgeText('ASIGNADA', ago(10 * MIN), NOW)).toBe('asignada hace 10 min');
    expect(stageAgeText('QA', ago(5_000), NOW)).toBe('en QA ahora');
  });

  it('says nothing for a finished task', () => {
    expect(stageAgeText('TERMINADA', ago(2 * DAY), NOW)).toBeNull();
  });
});
