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
