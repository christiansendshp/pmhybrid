import { describe, expect, it } from 'vitest';
import {
  hasNews,
  MAX_TASKS_LISTED,
  newsKind,
  sinceOf,
  unblockedIds,
  type NewsTask,
  type ProjectNews,
} from './since-visit.util.js';

const task = (n: number): NewsTask => ({
  id: `id-${n}`,
  externalId: `T-${n}`,
  title: `Task ${n}`,
});

const nothing = newsKind([]);

const news = (overrides: Partial<ProjectNews> = {}): ProjectNews => ({
  projectId: 'p1',
  name: 'Project',
  since: '2026-10-19T00:00:00.000Z',
  done: nothing,
  blocked: nothing,
  unblocked: nothing,
  newScope: nothing,
  conflicts: 0,
  ...overrides,
});

describe('sinceOf (Roadmap TASK-38)', () => {
  const now = new Date('2026-10-28T12:00:00Z');

  it('counts from the marker the person left', () => {
    const marker = new Date('2026-10-20T08:00:00Z');

    expect(sinceOf(marker, now)).toEqual(marker);
  });

  it('counts from 7 days back when the person has never marked the project', () => {
    expect(sinceOf(null, now).toISOString()).toBe('2026-10-21T12:00:00.000Z');
  });
});

describe('newsKind', () => {
  it('counts every task and names the first ten', () => {
    const tasks = Array.from({ length: 14 }, (_, index) => task(index));

    const kind = newsKind(tasks);

    expect([kind.count, kind.tasks.map((entry) => entry.id)]).toEqual([
      14,
      tasks.slice(0, MAX_TASKS_LISTED).map((entry) => entry.id),
    ]);
  });

  it('counts the number it is given when the list it has is only the first ones', () => {
    expect(newsKind([task(1), task(2)], 40).count).toBe(40);
  });

  it('keeps only what names a task, not what else the row had', () => {
    const row = { ...task(1), status: 'QA', secret: 'x' } as NewsTask;

    expect(newsKind([row]).tasks).toEqual([task(1)]);
  });
});

describe('hasNews', () => {
  it('is false for a project with nothing new', () => {
    expect(hasNews(news())).toBe(false);
  });

  it.each([
    ['done', { done: newsKind([task(1)]) }],
    ['blocked', { blocked: newsKind([task(1)]) }],
    ['unblocked', { unblocked: newsKind([task(1)]) }],
    ['new scope', { newScope: newsKind([task(1)]) }],
    ['conflicts', { conflicts: 2 }],
  ])('is true for a project with %s', (_kind, overrides) => {
    expect(hasNews(news(overrides))).toBe(true);
  });
});

describe('unblockedIds', () => {
  const blocked = { roadmapTable: 'BLOCKED' };

  it('names the task that moved to another table', () => {
    expect(
      unblockedIds([
        {
          entityId: 'a',
          previousValue: blocked,
          newValue: { roadmapTable: 'ACTIVE' },
        },
      ]),
    ).toEqual(['a']);
  });

  it('leaves out the task that stayed blocked', () => {
    expect(
      unblockedIds([
        { entityId: 'a', previousValue: blocked, newValue: blocked },
      ]),
    ).toEqual([]);
  });

  it('leaves out a row that vanished: it is in no table, not in another', () => {
    expect(
      unblockedIds([
        {
          entityId: 'a',
          previousValue: blocked,
          newValue: { roadmapTable: null },
        },
      ]),
    ).toEqual([]);
  });

  it('leaves out the task the change completed: it is done, not unblocked', () => {
    expect(
      unblockedIds([
        {
          entityId: 'a',
          previousValue: blocked,
          newValue: { status: 'TERMINADA', roadmapTable: null },
        },
      ]),
    ).toEqual([]);
  });

  it('leaves out an event that says nothing about where the task went', () => {
    expect(
      unblockedIds([{ entityId: 'a', previousValue: blocked, newValue: null }]),
    ).toEqual([]);
  });

  it('names a task once however many times it moved', () => {
    expect(
      unblockedIds([
        {
          entityId: 'a',
          previousValue: blocked,
          newValue: { roadmapTable: 'ACTIVE' },
        },
        {
          entityId: 'a',
          previousValue: blocked,
          newValue: { roadmapTable: 'NEAR_TERM' },
        },
      ]),
    ).toEqual(['a']);
  });
});
