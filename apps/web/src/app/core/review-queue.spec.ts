import { describe, expect, it } from 'vitest';
import { NO_REVIEWER, reviewGroups } from './review-queue.js';
import { TaskCard } from './tasks.service.js';

let sequence = 0;
function card(overrides: Partial<TaskCard> = {}): TaskCard {
  sequence += 1;
  return {
    id: `t${sequence}`,
    externalId: `PMH-${sequence}`,
    status: 'QA',
    statusChangedAt: '2026-10-10T00:00:00.000Z',
    createdAt: `2026-09-${String(sequence).padStart(2, '0')}T00:00:00.000Z`,
    reviewer: null,
    ...overrides,
  } as TaskCard;
}

const reviewer = (id: string, name: string) => ({ id, displayName: name, kind: 'HUMAN' as const });
const ids = (cards: TaskCard[]) => cards.map((c) => c.externalId);

describe('reviewGroups (Roadmap TASK-19)', () => {
  it('makes a queue for each reviewer and one for the tasks nobody was asked about', () => {
    const groups = reviewGroups(
      [
        card({ externalId: 'A', reviewer: reviewer('ana', 'Ana') }),
        card({ externalId: 'B', reviewer: null }),
        card({ externalId: 'C', reviewer: reviewer('bo', 'Bo') }),
      ],
      null,
    );

    expect(groups.map((group) => group.label)).toEqual(['Sin revisor', 'Ana', 'Bo']);
    expect(groups.map((group) => group.key)).toEqual([NO_REVIEWER, 'ana', 'bo']);
  });

  it('shows the queue of whoever looks at it first, then the tasks nobody holds, then the others by name', () => {
    const cards = [
      card({ externalId: 'A', reviewer: reviewer('ana', 'Ana') }),
      card({ externalId: 'B', reviewer: null }),
      card({ externalId: 'C', reviewer: reviewer('bo', 'Bo') }),
      card({ externalId: 'Z', reviewer: reviewer('zed', 'Zed') }),
    ];

    const groups = reviewGroups(cards, 'bo');

    expect(groups.map((group) => group.label)).toEqual(['Bo', 'Sin revisor', 'Ana', 'Zed']);
    expect(groups.map((group) => group.mine)).toEqual([true, false, false, false]);
  });

  it('is never "mine" for the tasks nobody was asked to review, even when the viewer has no id', () => {
    const groups = reviewGroups([card({ reviewer: null })], null);

    expect(groups[0].mine).toBe(false);
    expect(reviewGroups([card({ reviewer: null })], NO_REVIEWER)[0].mine).toBe(false);
  });

  it('puts the task that has waited longest first in every queue, then the oldest created', () => {
    const groups = reviewGroups(
      [
        card({ externalId: 'NEW', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
        card({ externalId: 'OLD', statusChangedAt: '2026-10-01T00:00:00.000Z' }),
        card({ externalId: 'MID', statusChangedAt: '2026-10-05T00:00:00.000Z' }),
        card({
          externalId: 'TIE-B',
          statusChangedAt: '2026-10-20T00:00:00.000Z',
          createdAt: '2026-09-02T00:00:00.000Z',
        }),
        card({
          externalId: 'TIE-A',
          statusChangedAt: '2026-10-20T00:00:00.000Z',
          createdAt: '2026-09-01T00:00:00.000Z',
        }),
      ],
      null,
    );

    expect(ids(groups[0].cards)).toEqual(['OLD', 'MID', 'NEW', 'TIE-A', 'TIE-B']);
  });

  it('lists only the tasks in QA, and nothing when none is', () => {
    expect(
      reviewGroups([card({ status: 'EN_DESARROLLO' }), card({ status: 'TERMINADA' })], null),
    ).toEqual([]);
    expect(reviewGroups([], 'ana')).toEqual([]);
  });

  it('does not change the cards it was given', () => {
    const cards = [
      card({ externalId: 'B', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
      card({ externalId: 'A', statusChangedAt: '2026-10-01T00:00:00.000Z' }),
    ];

    reviewGroups(cards, null);

    expect(ids(cards)).toEqual(['B', 'A']);
  });
});
