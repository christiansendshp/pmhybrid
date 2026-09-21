import { describe, expect, it } from 'vitest';
import { buildProjectContext } from './mcp-workflow-tools.js';

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
