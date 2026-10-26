import { describe, expect, it } from 'vitest';
import {
  buildProjectContext,
  buildReviewQueue,
  type ReviewQueueCard,
} from './mcp-workflow-tools.js';

const project = { id: 'p1', name: 'Site', description: null, status: 'ACTIVE' };
const card = (overrides: Record<string, unknown>) => ({
  id: 'x',
  externalId: null,
  title: 'A task',
  status: 'PENDIENTE',
  roadmapTable: 'ACTIVE',
  blockedReason: null,
  assigneeActorId: null,
  computedProgress: 0,
  ...overrides,
});

describe('buildProjectContext (Roadmap GAP-36b)', () => {
  it('counts by status, with every status present even at zero', () => {
    const context = buildProjectContext(
      project,
      [
        card({ status: 'QA' }),
        card({ status: 'QA' }),
        card({ status: 'TERMINADA' }),
      ],
      'agent',
      0,
    );

    expect(context.statusCounts).toEqual({
      PENDIENTE: 0,
      ASIGNADA: 0,
      EN_DESARROLLO: 0,
      QA: 2,
      TERMINADA: 1,
    });
    expect(context.totalTasks).toBe(3);
  });

  it("lists only the caller's own unfinished tasks, in brief", () => {
    const context = buildProjectContext(
      project,
      [
        card({
          id: 'mine-1',
          title: 'Mine',
          assigneeActorId: 'agent',
          status: 'EN_DESARROLLO',
          externalId: 'PMH-1',
        }),
        card({ id: 'mine-2', assigneeActorId: 'agent', status: 'TERMINADA' }),
        card({
          id: 'theirs',
          assigneeActorId: 'someone-else',
          status: 'EN_DESARROLLO',
        }),
      ],
      'agent',
      0,
    );

    expect(context.myOpenTasks).toEqual([
      {
        id: 'mine-1',
        externalId: 'PMH-1',
        title: 'Mine',
        status: 'EN_DESARROLLO',
      },
    ]);
  });

  it('lists what is blocked with its reason, and carries the open conflict count', () => {
    const context = buildProjectContext(
      project,
      [
        card({
          id: 'b',
          roadmapTable: 'BLOCKED',
          blockedReason: 'BLOQUEO - waiting for legal',
        }),
        card({ id: 'ok' }),
      ],
      'agent',
      3,
    );

    expect(context.blocked).toEqual([
      {
        id: 'b',
        externalId: null,
        title: 'A task',
        status: 'PENDIENTE',
        blockedReason: 'BLOQUEO - waiting for legal',
      },
    ]);
    expect(context.openConflicts).toBe(3);
    expect(context.project).toEqual(project);
  });

  it('says nothing about an empty project except zeroes', () => {
    const context = buildProjectContext(project, [], 'agent', 0);

    expect(context).toMatchObject({
      totalTasks: 0,
      myOpenTasks: [],
      blocked: [],
    });
  });
});

describe('buildReviewQueue (Roadmap TASK-10)', () => {
  const projects = [
    { id: 'p1', name: 'Site' },
    { id: 'p2', name: 'Docs' },
  ];
  const qa = (
    id: string,
    overrides: Partial<ReviewQueueCard> = {},
  ): ReviewQueueCard => ({
    id,
    externalId: null,
    title: `Task ${id}`,
    assignee: { displayName: 'Dev' },
    reviewerActorId: null,
    reviewer: null,
    reviewRequestedAt: null,
    statusChangedAt: new Date('2026-10-20T10:00:00Z'),
    ...overrides,
  });
  const queue = (cards: Record<string, ReviewQueueCard[]>, reviewer?: string) =>
    buildReviewQueue(
      projects,
      new Map(Object.entries(cards)),
      'me-id',
      reviewer,
    ).map((entry) => entry.taskId);

  it('lists the longest waiting first across projects, counting from the reviewer request when there is one', () => {
    expect(
      queue({
        p1: [
          qa('late', { statusChangedAt: new Date('2026-10-25T10:00:00Z') }),
          qa('asked', {
            statusChangedAt: new Date('2026-10-01T10:00:00Z'),
            reviewRequestedAt: new Date('2026-10-24T10:00:00Z'),
          }),
        ],
        p2: [
          qa('oldest', { statusChangedAt: new Date('2026-10-10T10:00:00Z') }),
        ],
      }),
    ).toEqual(['oldest', 'asked', 'late']);
  });

  it('puts a task with no known time last', () => {
    expect(
      queue({
        p1: [qa('unknown', { statusChangedAt: null }), qa('known')],
      }),
    ).toEqual(['known', 'unknown']);
  });

  it('keeps with "me" only the tasks that asked the caller', () => {
    const cards = {
      p1: [
        qa('mine', { reviewerActorId: 'me-id' }),
        qa('theirs', { reviewerActorId: 'someone' }),
        qa('nobody'),
      ],
    };

    expect(queue(cards, 'me')).toEqual(['mine']);
  });

  it('keeps with an actor id only the tasks that asked that actor', () => {
    const cards = {
      p1: [
        qa('mine', { reviewerActorId: 'me-id' }),
        qa('theirs', { reviewerActorId: 'someone' }),
      ],
    };

    expect(queue(cards, 'someone')).toEqual(['theirs']);
  });

  it('names the project, the assignee and the reviewer of each, and nothing internal', () => {
    const [entry] = buildReviewQueue(
      projects,
      new Map([
        [
          'p2',
          [
            qa('x', {
              externalId: 'PMH-4',
              reviewerActorId: 'r1',
              reviewer: { id: 'r1', displayName: 'Rita' },
            }),
          ],
        ],
      ]),
      'me-id',
    );

    expect(entry).toEqual({
      projectId: 'p2',
      projectName: 'Docs',
      taskId: 'x',
      externalId: 'PMH-4',
      title: 'Task x',
      assignee: 'Dev',
      reviewer: { id: 'r1', displayName: 'Rita' },
      waitingSince: new Date('2026-10-20T10:00:00Z'),
    });
  });

  it('is empty for projects with nothing in QA', () => {
    expect(queue({})).toEqual([]);
  });
});
