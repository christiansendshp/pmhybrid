import { describe, expect, it } from 'vitest';
import { statusCountEntries, totalCount } from './status-counts.js';
import { StatusCounts } from './tasks.service.js';

const COUNTS: StatusCounts = {
  PENDIENTE: 2,
  ASIGNADA: 0,
  EN_DESARROLLO: 1,
  QA: 0,
  TERMINADA: 3,
};

describe('statusCountEntries', () => {
  it('lists every Kanban status in board order, zero counts included', () => {
    expect(statusCountEntries(COUNTS)).toEqual([
      { status: 'PENDIENTE', count: 2 },
      { status: 'ASIGNADA', count: 0 },
      { status: 'EN_DESARROLLO', count: 1 },
      { status: 'QA', count: 0 },
      { status: 'TERMINADA', count: 3 },
    ]);
  });
});

describe('totalCount', () => {
  it('sums every status', () => {
    expect(totalCount(COUNTS)).toBe(6);
  });

  it('is zero for an all-zero breakdown', () => {
    expect(totalCount({ PENDIENTE: 0, ASIGNADA: 0, EN_DESARROLLO: 0, QA: 0, TERMINADA: 0 })).toBe(
      0,
    );
  });
});
