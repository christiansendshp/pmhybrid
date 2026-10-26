import { describe, expect, it } from 'vitest';
import { newsLines } from './since-visit.js';
import type { NewsKind, NewsTask, ProjectNews } from './since-visit.service.js';

const task = (n: number): NewsTask => ({ id: `id-${n}`, externalId: `T-${n}`, title: `Task ${n}` });

const kind = (count: number, listed = count): NewsKind => ({
  count,
  tasks: Array.from({ length: Math.min(count, listed) }, (_, index) => task(index)),
});

const news = (overrides: Partial<ProjectNews> = {}): ProjectNews => ({
  projectId: 'p1',
  name: 'Project',
  since: '2026-10-19T00:00:00.000Z',
  done: kind(0),
  blocked: kind(0),
  unblocked: kind(0),
  newScope: kind(0),
  conflicts: 0,
  ...overrides,
});

describe('newsLines (Roadmap TASK-39)', () => {
  it('has no line for what did not happen', () => {
    expect(newsLines(news())).toEqual([]);
  });

  it('says what needs a person first, then what is only news', () => {
    const lines = newsLines(
      news({
        done: kind(2),
        blocked: kind(1),
        unblocked: kind(3),
        newScope: kind(4),
        conflicts: 5,
      }),
    );

    expect(lines.map((line) => line.sentence)).toEqual([
      '1 tarea bloqueada',
      '5 conflictos nuevos',
      '3 tareas desbloqueadas',
      '2 tareas terminadas',
      '4 tareas nuevas',
    ]);
  });

  it.each([
    ['blocked', { blocked: kind(1) }, '1 tarea bloqueada'],
    ['unblocked', { unblocked: kind(1) }, '1 tarea desbloqueada'],
    ['done', { done: kind(1) }, '1 tarea terminada'],
    ['newScope', { newScope: kind(1) }, '1 tarea nueva'],
    ['conflicts', { conflicts: 1 }, '1 conflicto nuevo'],
  ])('says %s in the singular for one', (_key, overrides, sentence) => {
    expect(newsLines(news(overrides))[0].sentence).toBe(sentence);
  });

  it('names the tasks of a kind and how many more there are than the ones named', () => {
    const [line] = newsLines(news({ done: kind(14, 10) }));

    expect([line.tasks.length, line.more]).toEqual([10, 4]);
  });

  it('has no tasks to name for the conflicts: they are on their own page', () => {
    const [line] = newsLines(news({ conflicts: 2 }));

    expect([line.key, line.tasks, line.more]).toEqual(['conflicts', [], 0]);
  });
});
