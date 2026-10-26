import { describe, expect, it } from 'vitest';
import { dayKey, tallyStatuses } from './snapshot.util.js';

describe('tallyStatuses (Roadmap TASK-46)', () => {
  it('adds up the tasks of each status, every status being there', () => {
    expect(
      tallyStatuses([
        { status: 'PENDIENTE', count: 3 },
        { status: 'EN_DESARROLLO', count: 2 },
        { status: 'TERMINADA', count: 5 },
      ]),
    ).toEqual({
      total: 10,
      done: 5,
      byStatus: {
        PENDIENTE: 3,
        ASIGNADA: 0,
        EN_DESARROLLO: 2,
        QA: 0,
        TERMINADA: 5,
      },
    });
  });

  it('counts the groups of one status together', () => {
    expect(
      tallyStatuses([
        { status: 'QA', count: 1 },
        { status: 'QA', count: 4 },
      ]).byStatus.QA,
    ).toBe(5);
  });

  it('gives zeros for a project with no tasks', () => {
    expect(tallyStatuses([])).toEqual({
      total: 0,
      done: 0,
      byStatus: {
        PENDIENTE: 0,
        ASIGNADA: 0,
        EN_DESARROLLO: 0,
        QA: 0,
        TERMINADA: 0,
      },
    });
  });

  it('leaves out a status it does not know instead of counting it', () => {
    expect(tallyStatuses([{ status: 'SOMETHING_NEW', count: 9 }]).total).toBe(
      0,
    );
  });
});

describe('dayKey', () => {
  it('is the UTC day as YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-11-03T00:00:00.000Z'))).toBe('2026-11-03');
  });

  it('keeps the last moment of a UTC day in that day', () => {
    expect(dayKey(new Date('2026-11-03T23:59:59.999Z'))).toBe('2026-11-03');
  });
});
