import { describe, expect, it } from 'vitest';
import {
  closedSpan,
  instantCloseMetrics,
  isInstantClose,
  type TaskLifeSpan,
} from './instant-close.util.js';

const at = (minutes: number) =>
  new Date(Date.UTC(2026, 9, 13, 10, 0, 0) + minutes * 60_000);
const span = (started: number | null, done: number | null): TaskLifeSpan => ({
  startedAt: started === null ? null : at(started),
  doneAt: done === null ? null : at(done),
});

describe('instant close (Roadmap TASK-12)', () => {
  describe('isInstantClose', () => {
    it('is a task closed less than the threshold after it was started', () => {
      expect(isInstantClose(span(0, 4.9), 5)).toBe(true);
      expect(isInstantClose(span(0, 0), 5)).toBe(true);
    });

    it('is not a task closed at the threshold or later: the limit itself is not instant', () => {
      expect(isInstantClose(span(0, 5), 5)).toBe(false);
      expect(isInstantClose(span(0, 60), 5)).toBe(false);
    });

    it('is not a task that was never started or never closed, or whose close is before its start', () => {
      expect(isInstantClose(span(null, 3), 5)).toBe(false);
      expect(isInstantClose(span(0, null), 5)).toBe(false);
      expect(isInstantClose(span(10, 3), 5)).toBe(false);
    });

    it('follows the threshold it is given', () => {
      expect(isInstantClose(span(0, 20), 5)).toBe(false);
      expect(isInstantClose(span(0, 20), 30)).toBe(true);
    });
  });

  it('reads a span only when it is closed', () => {
    expect(closedSpan(span(0, 1))).toEqual({
      startedAt: at(0),
      doneAt: at(1),
    });
    expect(closedSpan(span(0, null))).toBeNull();
    expect(closedSpan(span(2, 1))).toBeNull();
  });

  describe('instantCloseMetrics', () => {
    it('counts the closed tasks and the instant ones among them, and gives the share', () => {
      const metrics = instantCloseMetrics(
        [
          span(0, 1),
          span(0, 2),
          span(0, 30),
          span(0, 90),
          span(0, null),
          span(null, 5),
        ],
        5,
      );

      expect(metrics).toEqual({
        thresholdMinutes: 5,
        closedTasks: 4,
        instantCloses: 2,
        share: 0.5,
      });
    });

    it('rounds the share to four decimals and has none while nothing is closed', () => {
      const thirds = instantCloseMetrics(
        [span(0, 1), span(0, 30), span(0, 40)],
        5,
      );
      expect(thirds.share).toBe(0.3333);
      expect(instantCloseMetrics([span(0, null)], 5)).toEqual({
        thresholdMinutes: 5,
        closedTasks: 0,
        instantCloses: 0,
        share: null,
      });
      expect(instantCloseMetrics([], 5).share).toBeNull();
    });
  });
});
