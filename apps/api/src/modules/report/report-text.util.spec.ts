import { describe, expect, it } from 'vitest';
import { idleText, riskReasons, signalDetail } from './report-text.util.js';

const ref = (n: number) => ({
  id: `id-${n}`,
  externalId: `T-${n}`,
  title: `Task ${n}`,
});

describe('idleText (Roadmap TASK-48)', () => {
  it.each([
    [1, '1 h'],
    [47, '47 h'],
    [48, '2 días'],
    [100, '4 días'],
  ])('says %i hours as %s', (hours, text) => {
    expect(idleText(hours)).toBe(text);
  });
});

describe('signalDetail', () => {
  it('says an overdue task and the day it was due', () => {
    expect(
      signalDetail({
        kind: 'OVERDUE',
        task: ref(1),
        dueDate: '2026-10-20T23:30:00.000Z',
      }),
    ).toBe('Fuera de plazo (debía estar terminada el 2026-10-20)');
  });

  it('says an overdue task even without the date', () => {
    expect(signalDetail({ kind: 'OVERDUE', task: ref(1) })).toBe(
      'Fuera de plazo',
    );
  });

  it('names the blocked tasks a task depends on', () => {
    expect(
      signalDetail({
        kind: 'BLOCKED_BY_BLOCKED',
        task: ref(1),
        blockedBy: [ref(2), { id: 'x', externalId: null, title: 'No id' }],
      }),
    ).toBe('Depende de una tarea bloqueada: T-2 Task 2, No id');
  });

  it('says nobody holds a task in development', () => {
    expect(signalDetail({ kind: 'UNOWNED_IN_DEVELOPMENT', task: ref(1) })).toBe(
      'En desarrollo y sin responsable',
    );
  });

  it('says how long a task in development has gone without activity', () => {
    expect(
      signalDetail({
        kind: 'STALE_IN_DEVELOPMENT',
        task: ref(1),
        idleHours: 100,
      }),
    ).toBe('En desarrollo y sin actividad hace 4 días');
  });
});

describe('riskReasons', () => {
  const none = {
    UNOWNED_IN_DEVELOPMENT: 0,
    BLOCKED_BY_BLOCKED: 0,
    STALE_IN_DEVELOPMENT: 0,
    OVERDUE: 0,
  };

  it('has no reason for nothing', () => {
    expect(riskReasons(none, 0)).toEqual([]);
  });

  it('says each signal that has a count, the late and the stuck first, and the blocked tasks last', () => {
    expect(
      riskReasons(
        {
          UNOWNED_IN_DEVELOPMENT: 1,
          BLOCKED_BY_BLOCKED: 3,
          STALE_IN_DEVELOPMENT: 4,
          OVERDUE: 2,
        },
        2,
      ),
    ).toEqual([
      '2 fuera de plazo',
      '3 esperan a una bloqueada',
      '1 en desarrollo sin responsable',
      '4 sin actividad en desarrollo',
      '2 bloqueadas',
    ]);
  });

  it('says one blocked task in the singular', () => {
    expect(riskReasons(none, 1)).toEqual(['1 bloqueada']);
  });
});
