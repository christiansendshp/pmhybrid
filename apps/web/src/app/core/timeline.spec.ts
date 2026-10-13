import { describe, expect, it } from 'vitest';
import type { Phase } from './hierarchy.service.js';
import { TaskCard } from './tasks.service.js';
import { axisTicks, barOf, buildTimeline, lengthText, percentOf } from './timeline.js';

const at = (iso: string) => new Date(iso).getTime();
const NOW = at('2026-10-13T12:00:00Z');

let sequence = 0;
function card(status: TaskCard['status'], overrides: Partial<TaskCard> = {}): TaskCard {
  sequence += 1;
  return {
    id: `t${sequence}`,
    externalId: `PMH-${sequence}`,
    status,
    phaseId: null,
    instantClose: false,
    completedAt: null,
    statusChangedAt: '2026-10-12T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  } as TaskCard;
}

const phase = (id: string, name: string, order: number): Phase => ({
  id,
  projectId: 'p1',
  name,
  order,
  description: null,
  status: null,
});

describe('barOf (Roadmap TASK-23)', () => {
  it('runs from the ledger’s first IN_PROGRESS to its last DONE for a finished task', () => {
    const bar = barOf(
      card('TERMINADA'),
      { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-07T10:00:00Z' },
      NOW,
    )!;

    expect(bar).toMatchObject({
      start: at('2026-10-05T10:00:00Z'),
      end: at('2026-10-07T10:00:00Z'),
      until: at('2026-10-07T10:00:00Z'),
      basis: 'LEDGER',
      mark: false,
      instant: false,
    });
  });

  it('is open and runs to now while the task is not done, whatever an old DONE entry says', () => {
    const bar = barOf(
      card('EN_DESARROLLO'),
      { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-06T10:00:00Z' },
      NOW,
    )!;

    expect(bar.end).toBeNull();
    expect(bar.until).toBe(NOW);
    expect(bar.mark).toBe(false);
  });

  it('draws a task closed instantly as a mark at its close, not as a bar of no width (AC-1)', () => {
    const bar = barOf(
      card('TERMINADA', { instantClose: true }),
      { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-05T10:02:00Z' },
      NOW,
    )!;

    expect(bar).toMatchObject({ mark: true, instant: true, until: at('2026-10-05T10:02:00Z') });
  });

  it('draws a close under a minute as a mark too, though it is not flagged', () => {
    const bar = barOf(
      card('TERMINADA'),
      { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-05T10:00:30Z' },
      NOW,
    )!;

    expect(bar).toMatchObject({ mark: true, instant: false });
  });

  it('starts at its creation when the ledger says nothing and the task is in development, in QA or done, and ends at its completion', () => {
    const open = barOf(card('QA', { createdAt: '2026-10-03T00:00:00.000Z' }), undefined, NOW)!;
    const done = barOf(
      card('TERMINADA', {
        createdAt: '2026-10-03T00:00:00.000Z',
        completedAt: '2026-10-09T00:00:00.000Z',
      }),
      undefined,
      NOW,
    )!;

    expect(open).toMatchObject({ basis: 'RECORD', start: at('2026-10-03T00:00:00Z'), end: null });
    expect(done).toMatchObject({
      basis: 'RECORD',
      start: at('2026-10-03T00:00:00Z'),
      end: at('2026-10-09T00:00:00Z'),
    });
  });

  it('draws nothing for a task that was never started: waiting is not work', () => {
    expect(barOf(card('PENDIENTE'), undefined, NOW)).toBeNull();
    expect(barOf(card('ASIGNADA'), undefined, NOW)).toBeNull();
  });

  it('starts a task the ledger started even when the board still shows it waiting', () => {
    const bar = barOf(card('ASIGNADA'), { startedAt: '2026-10-05T10:00:00Z', doneAt: null }, NOW);

    expect(bar).toMatchObject({ basis: 'LEDGER', end: null });
  });

  it('does not take a ledger close dated before its start: the next date that makes sense ends the bar', () => {
    const bar = barOf(
      card('TERMINADA', { completedAt: '2026-10-08T00:00:00.000Z' }),
      { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-04T10:00:00Z' },
      NOW,
    )!;

    expect(bar.end).toBe(at('2026-10-08T00:00:00Z'));
  });

  it('does not take the ledger’s close for a task whose dates come from the record', () => {
    const bar = barOf(
      card('TERMINADA', {
        createdAt: '2026-10-03T00:00:00.000Z',
        completedAt: '2026-10-09T00:00:00.000Z',
      }),
      { startedAt: null, doneAt: '2026-10-04T00:00:00Z' },
      NOW,
    )!;

    expect(bar).toMatchObject({ basis: 'RECORD', end: at('2026-10-09T00:00:00Z') });
  });

  it('is a mark at its start when nothing gives a usable close to a finished task', () => {
    const bar = barOf(
      card('TERMINADA', { statusChangedAt: '2026-09-01T00:00:00.000Z' }),
      { startedAt: '2026-10-05T10:00:00Z', doneAt: null },
      NOW,
    )!;

    expect(bar).toMatchObject({ end: at('2026-10-05T10:00:00Z'), mark: true, instant: false });
  });

  it('never ends before it starts, when a clock was ahead', () => {
    const bar = barOf(
      card('EN_DESARROLLO'),
      { startedAt: '2026-10-20T00:00:00Z', doneAt: null },
      NOW,
    )!;

    expect(bar.until).toBe(at('2026-10-20T00:00:00Z'));
  });
});

describe('buildTimeline (Roadmap TASK-23)', () => {
  const phases = [phase('p2', 'Second', 2), phase('p1', 'First', 1)];

  it('groups the tasks by phase in the phase order, the tasks of no phase last, and leaves out a phase with no task', () => {
    const result = buildTimeline(
      [
        card('EN_DESARROLLO', { phaseId: 'p2' }),
        card('EN_DESARROLLO', { phaseId: null }),
        card('EN_DESARROLLO', { phaseId: 'p1' }),
        card('EN_DESARROLLO', { phaseId: 'gone' }),
      ],
      {},
      [...phases, phase('p3', 'Empty', 3)],
      NOW,
    );

    expect(result.phases.map((group) => group.name)).toEqual(['First', 'Second', 'Sin fase']);
    expect(result.phases[2].total).toBe(2);
  });

  it('says how many tasks a phase has, how many were never started, and the span it covers (AC-2)', () => {
    const result = buildTimeline(
      [
        card('TERMINADA', { phaseId: 'p1', externalId: 'A' }),
        card('EN_DESARROLLO', { phaseId: 'p1', externalId: 'B' }),
        card('PENDIENTE', { phaseId: 'p1', externalId: 'C' }),
      ],
      {
        A: { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-07T10:00:00Z' },
        B: { startedAt: '2026-10-06T10:00:00Z', doneAt: null },
      },
      phases,
      NOW,
    );

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]).toMatchObject({
      total: 3,
      notStarted: 1,
      span: { start: at('2026-10-05T10:00:00Z'), end: NOW },
    });
  });

  it('has no span for a phase where nothing was started, and no axis when nothing is drawn', () => {
    const result = buildTimeline([card('PENDIENTE', { phaseId: 'p1' })], {}, phases, NOW);

    expect(result.phases[0]).toMatchObject({ total: 1, notStarted: 1, span: null });
    expect(result.axis).toBeNull();
  });

  it('orders the bars of a phase by start, then by Roadmap ID in natural order', () => {
    const spans = {
      'T-10': { startedAt: '2026-10-05T10:00:00Z', doneAt: null },
      'T-2': { startedAt: '2026-10-05T10:00:00Z', doneAt: null },
      'T-1': { startedAt: '2026-10-06T10:00:00Z', doneAt: null },
    };
    const result = buildTimeline(
      ['T-1', 'T-10', 'T-2'].map((externalId) =>
        card('EN_DESARROLLO', { phaseId: 'p1', externalId }),
      ),
      spans,
      phases,
      NOW,
    );

    expect(result.phases[0].bars.map((bar) => bar.card.externalId)).toEqual(['T-2', 'T-10', 'T-1']);
  });

  it('puts every bar on one axis from the earliest start to now, with a day at least', () => {
    const open = buildTimeline(
      [card('EN_DESARROLLO', { phaseId: 'p1', externalId: 'A' })],
      { A: { startedAt: '2026-10-05T10:00:00Z', doneAt: null } },
      phases,
      NOW,
    );
    const lone = buildTimeline(
      [card('TERMINADA', { phaseId: 'p1', externalId: 'A', instantClose: true })],
      { A: { startedAt: '2026-10-05T10:00:00Z', doneAt: '2026-10-05T10:01:00Z' } },
      phases,
      NOW,
    );

    expect(open.axis).toEqual({ start: at('2026-10-05T10:00:00Z'), end: NOW });
    expect(lone.axis).toEqual({
      start: at('2026-10-05T10:00:00Z'),
      end: at('2026-10-05T10:00:00Z') + 24 * 60 * 60_000,
    });
  });
});

describe('percentOf, axisTicks and lengthText', () => {
  const axis = { start: at('2026-10-01T00:00:00Z'), end: at('2026-10-11T00:00:00Z') };

  it('places a time as a share of the axis, kept inside it', () => {
    expect(percentOf(at('2026-10-06T00:00:00Z'), axis)).toBe(50);
    expect(percentOf(axis.start - 1000, axis)).toBe(0);
    expect(percentOf(axis.end + 1000, axis)).toBe(100);
  });

  it('marks the axis with about eight steps at most, on round times', () => {
    const ticks = axisTicks(axis);

    expect(ticks.length).toBeLessThanOrEqual(10);
    expect(ticks.length).toBeGreaterThan(1);
    // Ten days: steps of a day, each at midnight UTC.
    expect(ticks[0].at % (24 * 60 * 60_000)).toBe(0);
    expect(ticks.every((tick) => tick.percent >= 0 && tick.percent <= 100)).toBe(true);
  });

  it('says a length in the unit that fits', () => {
    expect(lengthText(10_000)).toBe('menos de 1 min');
    expect(lengthText(5 * 60_000)).toBe('5 min');
    expect(lengthText(3 * 3_600_000)).toBe('3 h');
    expect(lengthText(12 * 86_400_000)).toBe('12 d');
    expect(lengthText(-5)).toBe('menos de 1 min');
  });
});
