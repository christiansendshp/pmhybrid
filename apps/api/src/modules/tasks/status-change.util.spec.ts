import { describe, expect, it } from 'vitest';
import { statusStamp } from './status-change.util.js';

describe('statusStamp (Roadmap TASK-11)', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('stamps a change of status with the moment it happened', () => {
    expect(statusStamp('PENDIENTE', 'ASIGNADA', now)).toEqual({
      statusChangedAt: now,
    });
    expect(statusStamp('TERMINADA', 'EN_DESARROLLO', now)).toEqual({
      statusChangedAt: now,
    });
  });

  it('writes nothing when the status is the same, so the time in a state is not reset', () => {
    expect(statusStamp('QA', 'QA', now)).toEqual({});
  });

  it('stamps a task that had no status before', () => {
    expect(statusStamp(null, 'PENDIENTE', now)).toEqual({
      statusChangedAt: now,
    });
    expect(statusStamp(undefined, 'PENDIENTE', now)).toEqual({
      statusChangedAt: now,
    });
  });
});

describe('statusStamp: the reviewer asked for in QA (Roadmap SUBTASK-09.1)', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('ends the request for a reviewer when the task leaves QA, whichever way and wherever it goes', () => {
    for (const next of [
      'EN_DESARROLLO',
      'TERMINADA',
      'ASIGNADA',
      'PENDIENTE',
    ]) {
      expect(statusStamp('QA', next, now), next).toEqual({
        statusChangedAt: now,
        reviewerActorId: null,
        reviewRequestedAt: null,
      });
    }
  });

  it('leaves the reviewer alone on any other change and when the status did not change', () => {
    expect(statusStamp('EN_DESARROLLO', 'QA', now)).toEqual({
      statusChangedAt: now,
    });
    expect(statusStamp('ASIGNADA', 'EN_DESARROLLO', now)).toEqual({
      statusChangedAt: now,
    });
    expect(statusStamp('QA', 'QA', now)).toEqual({});
  });
});
