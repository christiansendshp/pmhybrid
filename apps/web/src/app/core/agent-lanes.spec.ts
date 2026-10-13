import { describe, expect, it } from 'vitest';
import { agentLanes } from './agent-lanes.js';
import { ProjectMember } from './projects.service.js';
import { TaskCard } from './tasks.service.js';

const member = (
  id: string,
  name: string,
  kind: 'HUMAN' | 'AI_AGENT',
  isActive = true,
): ProjectMember => ({
  id: `m-${id}`,
  projectId: 'p1',
  actorId: id,
  joinedAt: '2026-09-01T00:00:00.000Z',
  isActive,
  actor: { id, displayName: name, kind, email: null },
});

let sequence = 0;
function card(
  assigneeId: string | null,
  status: TaskCard['status'],
  overrides: Partial<TaskCard> = {},
): TaskCard {
  sequence += 1;
  return {
    id: `t${sequence}`,
    externalId: `PMH-${sequence}`,
    status,
    statusChangedAt: '2026-10-10T00:00:00.000Z',
    createdAt: `2026-09-${String(sequence).padStart(2, '0')}T00:00:00.000Z`,
    assignee: assigneeId
      ? { id: assigneeId, displayName: assigneeId, kind: 'AI_AGENT', model: null }
      : null,
    ...overrides,
  } as TaskCard;
}

const members = [
  member('zed', 'Zed', 'AI_AGENT'),
  member('codex', 'Codex', 'AI_AGENT'),
  member('idle', 'Idle Bot', 'AI_AGENT'),
  member('ana', 'Ana', 'HUMAN'),
  member('gone', 'Gone', 'AI_AGENT', false),
];

describe('agentLanes (Roadmap TASK-20)', () => {
  it('makes a lane for every active agent of the project, the idle ones too, by name, and none for a person or a former member', () => {
    const { lanes } = agentLanes([card('codex', 'QA')], members, null);

    expect(lanes.map((lane) => lane.name)).toEqual(['Codex', 'Idle Bot', 'Zed']);
    expect(lanes.find((lane) => lane.name === 'Idle Bot')).toMatchObject({ total: 0 });
  });

  it('puts each task in the column of its stage, the one that has waited longest first', () => {
    const { lanes } = agentLanes(
      [
        card('codex', 'EN_DESARROLLO', {
          externalId: 'NEW',
          statusChangedAt: '2026-10-12T00:00:00.000Z',
        }),
        card('codex', 'EN_DESARROLLO', {
          externalId: 'OLD',
          statusChangedAt: '2026-10-01T00:00:00.000Z',
        }),
        card('codex', 'QA', { externalId: 'IN-QA' }),
        card('zed', 'TERMINADA', { externalId: 'OTHER' }),
      ],
      members,
      null,
    );
    const codex = lanes.find((lane) => lane.name === 'Codex')!;

    expect(codex.columns.EN_DESARROLLO.map((c) => c.externalId)).toEqual(['OLD', 'NEW']);
    expect(codex.columns.QA.map((c) => c.externalId)).toEqual(['IN-QA']);
    expect(codex.columns.PENDIENTE).toEqual([]);
    expect(codex.total).toBe(3);
    expect(lanes.find((lane) => lane.name === 'Zed')?.columns.TERMINADA).toHaveLength(1);
  });

  it('counts the tasks that are in no lane, nobody holds or a person does, so they are not hidden', () => {
    const { withoutAgent } = agentLanes(
      [card('codex', 'QA'), card(null, 'PENDIENTE'), card('ana', 'ASIGNADA'), card(null, 'QA')],
      members,
      null,
    );

    expect(withoutAgent).toBe(3);
  });

  it('says the work in development of an agent against the limit per agent, and exceeded only past it', () => {
    const cards = [
      card('codex', 'EN_DESARROLLO'),
      card('codex', 'EN_DESARROLLO'),
      card('codex', 'QA'),
      card('zed', 'EN_DESARROLLO'),
    ];

    const { lanes } = agentLanes(cards, members, 2);

    expect(lanes.find((lane) => lane.name === 'Codex')?.wip).toEqual({
      count: 2,
      limit: 2,
      exceeded: false,
    });
    expect(lanes.find((lane) => lane.name === 'Zed')?.wip).toEqual({
      count: 1,
      limit: 2,
      exceeded: false,
    });
    expect(
      agentLanes(cards, members, 1).lanes.find((lane) => lane.name === 'Codex')?.wip?.exceeded,
    ).toBe(true);
  });

  it('has no limit to show without one', () => {
    const { lanes } = agentLanes([card('codex', 'EN_DESARROLLO')], members, null);

    expect(lanes.every((lane) => lane.wip === null)).toBe(true);
  });

  it('reads the limit against all the tasks of the project when the filters leave some out', () => {
    const all = [
      card('codex', 'EN_DESARROLLO'),
      card('codex', 'EN_DESARROLLO'),
      card('codex', 'EN_DESARROLLO'),
    ];
    const filtered = [all[0]];

    const { lanes } = agentLanes(filtered, members, 2, all);

    expect(lanes.find((lane) => lane.name === 'Codex')?.wip).toEqual({
      count: 3,
      limit: 2,
      exceeded: true,
    });
    expect(lanes.find((lane) => lane.name === 'Codex')?.total).toBe(1);
  });

  it('names the model of an agent from the tasks that carry it', () => {
    const { lanes } = agentLanes(
      [
        card('codex', 'QA', {
          assignee: {
            id: 'codex',
            displayName: 'Codex',
            kind: 'AI_AGENT',
            model: 'Claude Sonnet 5.5',
          },
        }),
      ],
      members,
      null,
    );

    expect(lanes.find((lane) => lane.name === 'Codex')?.model).toBe('Claude Sonnet 5.5');
    expect(lanes.find((lane) => lane.name === 'Zed')?.model).toBeNull();
  });
});
