import { describe, expect, it } from 'vitest';
import { AgentLedgerLinkService } from './agent-ledger-link.service.js';

interface FakeAgent {
  id: string;
  displayName: string;
  aliases?: string[];
}
interface FakeEvent {
  projectId: string;
  agentName: string;
  agentActorId: string | null;
  taskExternalId?: string | null;
  timestampFromLog?: Date;
}

const DEFAULT_TIME = new Date('2026-10-01T00:00:00Z');
interface FakeTask {
  projectId: string;
  rawOwner: string | null;
  assigneeActorId: string | null;
}

const key = (value: string) =>
  value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/** Just enough of Prisma for the three queries the service makes, over arrays. */
function fakeDb(input: {
  agents: FakeAgent[];
  events?: FakeEvent[];
  tasks?: FakeTask[];
  members?: {
    id: string;
    displayName: string;
    kind: 'HUMAN' | 'AI_AGENT';
    aliases?: string[];
  }[];
}) {
  const events = input.events ?? [];
  const tasks = input.tasks ?? [];
  const matches = (
    event: FakeEvent,
    where: Record<string, unknown>,
  ): boolean => {
    if (where.projectId !== undefined && event.projectId !== where.projectId) {
      return false;
    }
    if (where.agentName !== undefined && event.agentName !== where.agentName) {
      return false;
    }
    if (where.agentActorId === null && event.agentActorId !== null) {
      return false;
    }
    const filter = where.agentActorId as { not: string | null } | undefined;
    if (
      filter &&
      typeof filter === 'object' &&
      event.agentActorId === filter.not
    ) {
      return false;
    }
    const either = where.OR as Record<string, unknown>[] | undefined;
    return either
      ? either.some((branch) =>
          matches(event, { ...where, OR: undefined, ...branch }),
        )
      : true;
  };
  const db = {
    actor: {
      findMany: async () =>
        input.agents.map((agent) => ({
          id: agent.id,
          displayName: agent.displayName,
          agentProfile: {
            identifiers: (agent.aliases ?? []).map((alias) => ({
              key: key(alias),
            })),
          },
        })),
    },
    agentLogEvent: {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        events
          .filter((candidate) => matches(candidate, where))
          .map((event) => ({
            agentName: event.agentName,
            taskExternalId: event.taskExternalId ?? null,
            timestampFromLog: event.timestampFromLog ?? DEFAULT_TIME,
          })),
      groupBy: async ({ where = {} }: { where?: Record<string, unknown> }) => {
        const groups = new Map<string, number>();
        for (const event of events.filter((candidate) =>
          matches(candidate, where),
        )) {
          groups.set(event.agentName, (groups.get(event.agentName) ?? 0) + 1);
        }
        return [...groups].map(([agentName, count]) => ({
          agentName,
          _count: { _all: count },
        }));
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: { agentActorId: string | null };
      }) => {
        const hit = events.filter((candidate) => matches(candidate, where));
        hit.forEach((event) => {
          event.agentActorId = data.agentActorId;
        });
        return { count: hit.length };
      },
    },
    projectMember: {
      findMany: async () =>
        (input.members ?? []).map((member) => ({
          actor: {
            id: member.id,
            displayName: member.displayName,
            kind: member.kind,
            agentProfile:
              member.kind === 'AI_AGENT'
                ? {
                    identifiers: (member.aliases ?? []).map((value) => ({
                      value,
                    })),
                  }
                : null,
          },
        })),
    },
    task: {
      findMany: async () =>
        tasks.filter(
          (task) => task.rawOwner !== null && task.assigneeActorId === null,
        ),
    },
  };
  return { db: db as never, events };
}

const service = () => new AgentLedgerLinkService({} as never);

describe('AgentLedgerLinkService (Roadmap TASK-02)', () => {
  const sonnet: FakeAgent = {
    id: 'a1',
    displayName: 'Claude Sonnet',
    aliases: ['claude-sonnet-5-5', 'Claude'],
  };
  const codex: FakeAgent = {
    id: 'a2',
    displayName: 'Codex',
    aliases: ['réviseur'],
  };

  describe('resolve', () => {
    it('names the one agent whose display name, ledger name or alias it is, ignoring case and spacing', async () => {
      const { db } = fakeDb({ agents: [sonnet, codex] });

      const resolved = await service().resolve(
        ['claude sonnet', ' CLAUDE-SONNET-5-5 ', 'claude', 'CODEX', 'Réviseur'],
        db,
      );

      expect([...resolved.values()]).toEqual(['a1', 'a1', 'a1', 'a2', 'a2']);
    });

    it('keeps the name as given for its key, and does not fold accents', async () => {
      const { db } = fakeDb({ agents: [codex] });

      const resolved = await service().resolve(['reviseur', 'Réviseur'], db);

      expect(resolved.get('reviseur')).toBeNull();
      expect(resolved.get('Réviseur')).toBe('a2');
    });

    it('is nobody for a name no agent answers to, and for one two agents answer to', async () => {
      const rival: FakeAgent = {
        id: 'a3',
        displayName: 'Rival',
        aliases: ['claude'],
      };
      const { db } = fakeDb({ agents: [sonnet, rival] });

      const resolved = await service().resolve(['claude', 'Nobody'], db);

      expect(resolved.get('claude')).toBeNull();
      expect(resolved.get('Nobody')).toBeNull();
    });

    it('asks nothing of the database when there is no name', async () => {
      const resolved = await service().resolve([], {} as never);
      expect(resolved.size).toBe(0);
    });
  });

  describe('linkUnlinked', () => {
    it('links the events whose name resolves, leaves the others null, and a second run changes nothing', async () => {
      const { db, events } = fakeDb({
        agents: [sonnet],
        events: [
          { projectId: 'p1', agentName: 'claude', agentActorId: null },
          { projectId: 'p1', agentName: 'Claude Sonnet', agentActorId: null },
          { projectId: 'p1', agentName: 'Stranger', agentActorId: null },
          { projectId: 'p2', agentName: 'claude', agentActorId: null },
        ],
      });

      const first = await service().linkUnlinked(db, 'p1');
      const second = await service().linkUnlinked(db, 'p1');

      expect(first).toBe(2);
      expect(second).toBe(0);
      expect(events.map((event) => event.agentActorId)).toEqual([
        'a1',
        'a1',
        null,
        null,
      ]);
    });
  });

  describe('relinkAll', () => {
    it('links what now resolves, unlinks what no longer does, moves what moved, and a second run changes nothing', async () => {
      const { db, events } = fakeDb({
        agents: [sonnet, codex],
        events: [
          { projectId: 'p1', agentName: 'claude', agentActorId: null },
          { projectId: 'p1', agentName: 'réviseur', agentActorId: 'a1' },
          { projectId: 'p2', agentName: 'gone', agentActorId: 'a1' },
          { projectId: 'p2', agentName: 'CODEX', agentActorId: 'a2' },
        ],
      });

      const first = await service().relinkAll(db);
      const second = await service().relinkAll(db);

      expect(first).toBe(3);
      expect(second).toBe(0);
      expect(events.map((event) => event.agentActorId)).toEqual([
        'a1',
        'a2',
        null,
        'a2',
      ]);
    });
  });

  describe('unresolved', () => {
    it('lists the ledger names and the owners that name no agent, with a count and why, and leaves out what the next sync resolves', async () => {
      const rival: FakeAgent = {
        id: 'a3',
        displayName: 'Rival',
        aliases: ['claude'],
      };
      const { db } = fakeDb({
        agents: [sonnet, rival, codex],
        events: [
          { projectId: 'p1', agentName: 'Stranger', agentActorId: null },
          { projectId: 'p1', agentName: 'Stranger', agentActorId: null },
          { projectId: 'p1', agentName: 'claude', agentActorId: null },
          // Resolvable and not linked yet: the next sync links it, so it is no gap.
          { projectId: 'p1', agentName: 'Codex', agentActorId: null },
          { projectId: 'p1', agentName: 'Linked', agentActorId: 'a1' },
          { projectId: 'p2', agentName: 'Elsewhere', agentActorId: null },
        ],
        members: [
          { id: 'm1', displayName: 'Ana', kind: 'HUMAN' },
          { id: 'm2', displayName: 'Twin', kind: 'HUMAN' },
          { id: 'm3', displayName: 'Twin', kind: 'HUMAN' },
          { id: 'm4', displayName: 'Codex', kind: 'AI_AGENT' },
        ],
        tasks: [
          {
            projectId: 'p1',
            rawOwner: 'ghost@2026-10-13T10:00:00Z',
            assigneeActorId: null,
          },
          { projectId: 'p1', rawOwner: ' GHOST ', assigneeActorId: null },
          { projectId: 'p1', rawOwner: 'Twin', assigneeActorId: null },
          { projectId: 'p1', rawOwner: 'ana', assigneeActorId: null },
          {
            projectId: 'p1',
            rawOwner: 'Codex@2026-10-13T10:00:00Z',
            assigneeActorId: 'm4',
          },
          { projectId: 'p1', rawOwner: null, assigneeActorId: null },
        ],
      });

      const gaps = await service().unresolved('p1', db);

      expect(gaps.ledgerNames).toEqual([
        {
          name: 'Stranger',
          events: 2,
          tasks: 0,
          firstSeen: DEFAULT_TIME,
          lastSeen: DEFAULT_TIME,
          reason: 'UNKNOWN',
        },
        {
          name: 'claude',
          events: 1,
          tasks: 0,
          firstSeen: DEFAULT_TIME,
          lastSeen: DEFAULT_TIME,
          reason: 'AMBIGUOUS',
        },
      ]);
      expect(gaps.ownerNames).toEqual([
        { name: 'ghost', tasks: 2, reason: 'UNKNOWN' },
        { name: 'Twin', tasks: 1, reason: 'AMBIGUOUS' },
      ]);
    });
  });

  describe('unregistered (Roadmap TASK-03)', () => {
    const at = (day: number) =>
      new Date(`2026-10-${String(day).padStart(2, '0')}T10:00:00Z`);
    const event = (
      agentName: string,
      rest: Partial<FakeEvent> = {},
    ): FakeEvent => ({
      projectId: 'p1',
      agentName,
      agentActorId: null,
      ...rest,
    });

    it('counts the entries and the different tasks of a name, and when it was first and last seen by its own clock', async () => {
      const { db } = fakeDb({
        agents: [sonnet],
        events: [
          event('Stranger', { taskExternalId: 'T-1', timestampFromLog: at(5) }),
          event('Stranger', { taskExternalId: 'T-1', timestampFromLog: at(2) }),
          event('Stranger', { taskExternalId: 'T-2', timestampFromLog: at(9) }),
          event('Stranger', { taskExternalId: null, timestampFromLog: at(3) }),
        ],
      });

      const [stranger] = await service().unregistered('p1', db);

      expect(stranger).toEqual({
        name: 'Stranger',
        entries: 4,
        tasks: 2,
        firstSeen: at(2),
        lastSeen: at(9),
        reason: 'UNKNOWN',
      });
    });

    it('is one name for spellings that differ in case or spacing, spelled as the ledger does most', async () => {
      const { db } = fakeDb({
        agents: [],
        events: [event('stranger'), event('Stranger '), event('stranger')],
      });

      const names = await service().unregistered('p1', db);

      expect(names).toEqual([
        expect.objectContaining({ name: 'stranger', entries: 3 }),
      ]);
    });

    it('lists the most active name first, and the alphabetical one first among equals', async () => {
      const { db } = fakeDb({
        agents: [],
        events: [event('beta'), event('alpha'), event('busy'), event('busy')],
      });

      const names = (await service().unregistered('p1', db)).map(
        (item) => item.name,
      );

      expect(names).toEqual(['busy', 'alpha', 'beta']);
    });

    it('leaves out a name an agent answers to, which the next sync links', async () => {
      const { db } = fakeDb({
        agents: [codex],
        events: [event('Codex'), event('Stranger')],
      });

      const names = (await service().unregistered('p1', db)).map(
        (item) => item.name,
      );

      expect(names).toEqual(['Stranger']);
    });

    it('leaves out the events of another project and the ones already linked to an agent', async () => {
      const { db } = fakeDb({
        agents: [sonnet],
        events: [
          { projectId: 'p2', agentName: 'Elsewhere', agentActorId: null },
          { projectId: 'p1', agentName: 'Linked', agentActorId: 'a1' },
        ],
      });

      expect(await service().unregistered('p1', db)).toEqual([]);
    });

    it('says AMBIGUOUS for a name two agents answer to', async () => {
      const rival: FakeAgent = {
        id: 'a3',
        displayName: 'Rival',
        aliases: ['claude'],
      };
      const { db } = fakeDb({
        agents: [sonnet, rival],
        events: [event('claude')],
      });

      const [name] = await service().unregistered('p1', db);

      expect(name.reason).toBe('AMBIGUOUS');
    });
  });
});
