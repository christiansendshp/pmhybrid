import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ownerNameFromRaw,
  resolveOwner,
  type OwnerCandidate,
} from '../roadmap/roadmap-owner.util.js';
import { identifierKey } from './agent-identity.util.js';

/** What the service needs of the database: the client, or the transaction a sync already holds. */
type Db = Pick<
  Prisma.TransactionClient,
  'actor' | 'agentLogEvent' | 'projectMember' | 'task'
>;

/** Why a name names no agent: no one answers to it, or two agents do. */
export type UnresolvedReason = 'UNKNOWN' | 'AMBIGUOUS';

/** The names a project's documents use that no agent could be found for, with how many records carry each (Roadmap TASK-02). */
export interface UnresolvedNames {
  /** Names the Agentslog's entries carry, with the number of entries and tasks and when it was first and last seen (Roadmap TASK-03). */
  ledgerNames: {
    name: string;
    events: number;
    tasks: number;
    firstSeen: Date;
    lastSeen: Date;
    reason: UnresolvedReason;
  }[];
  /** Owners the Roadmap's rows carry that resolved to no member, with the number of tasks. */
  ownerNames: { name: string; tasks: number; reason: UnresolvedReason }[];
}

/** A name the ledger carries that no registered agent answers to, with what it has done (Roadmap TASK-03). */
export interface UnregisteredName {
  /** The spelling the ledger uses most; other spellings of it (case, spacing) are counted here too. */
  name: string;
  entries: number;
  /** How many different tasks its entries are about. */
  tasks: number;
  /** The earliest and the latest time an entry of it says, by the agent's own clock. */
  firstSeen: Date;
  lastSeen: Date;
  reason: UnresolvedReason;
}

/**
 * Links the ledger's agent names to the agents they name (Roadmap TASK-02).
 * `AgentLogEvent.agentName` is what the agent wrote, exactly; `agentActorId` is
 * the agent it is, when that is one: a name resolves to an agent through its
 * display name, its ledger name or an alias, and a name that is no one's, or is
 * two agents', resolves to nobody. The link is never a guess.
 *
 * Both directions are idempotent, so running them twice changes nothing: a sync
 * links what is still unlinked, and a change to an agent's names relinks every
 * event, so a name that was freed stops pointing at the agent that had it.
 */
@Injectable()
export class AgentLedgerLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /** The agents that answer to each name, by its identifier key. */
  private async ownersByKey(db: Db): Promise<Map<string, Set<string>>> {
    const agents = await db.actor.findMany({
      where: { kind: 'AI_AGENT' },
      select: {
        id: true,
        displayName: true,
        agentProfile: { select: { identifiers: { select: { key: true } } } },
      },
    });
    const owners = new Map<string, Set<string>>();
    const own = (key: string, actorId: string) => {
      const set = owners.get(key) ?? new Set<string>();
      set.add(actorId);
      owners.set(key, set);
    };
    for (const agent of agents) {
      own(identifierKey(agent.displayName), agent.id);
      for (const identifier of agent.agentProfile?.identifiers ?? []) {
        own(identifier.key, agent.id);
      }
    }
    return owners;
  }

  /** The one agent each name names, or null for a name that names none or several. Keys are the names as given. */
  async resolve(
    names: Iterable<string>,
    db: Db = this.prisma,
  ): Promise<Map<string, string | null>> {
    const wanted = [...new Set(names)];
    if (wanted.length === 0) {
      return new Map();
    }
    const owners = await this.ownersByKey(db);
    return new Map(
      wanted.map((name) => {
        const set = owners.get(identifierKey(name));
        return [name, set?.size === 1 ? [...set][0] : null] as const;
      }),
    );
  }

  /** The people and agents a document's owner can name: the project's active members (Roadmap GAP-35a). */
  async ownerCandidates(db: Db, projectId: string): Promise<OwnerCandidate[]> {
    const members = await db.projectMember.findMany({
      where: { projectId, isActive: true, actor: { isActive: true } },
      select: {
        actor: {
          select: {
            id: true,
            displayName: true,
            kind: true,
            // The names an agent goes by in the documents (Roadmap TASK-02).
            agentProfile: {
              select: { identifiers: { select: { value: true } } },
            },
          },
        },
      },
    });
    return members.map(({ actor }) => ({
      actorId: actor.id,
      displayName: actor.displayName,
      kind: actor.kind,
      names: actor.agentProfile?.identifiers.map((item) => item.value) ?? [],
    }));
  }

  /**
   * The names a project's documents carry that name no agent, and why, with a count each
   * (Roadmap TASK-02). Read-only: nothing is linked, assigned or written to a document.
   */
  async unresolved(
    projectId: string,
    db: Db = this.prisma,
  ): Promise<UnresolvedNames> {
    // The same list a person registers from (Roadmap TASK-03); an unlinked event whose name does
    // resolve is one the next sync links, not a gap, and it is not in it.
    const ledgerNames = (await this.unregistered(projectId, db)).map(
      ({ entries, ...name }) => ({ ...name, events: entries }),
    );

    const candidates = await this.ownerCandidates(db, projectId);
    const unassigned = await db.task.findMany({
      where: {
        projectId,
        deletedAt: null,
        rawOwner: { not: null },
        assigneeActorId: null,
      },
      select: { rawOwner: true },
    });
    const byOwner = new Map<string, { name: string; tasks: number }>();
    for (const { rawOwner } of unassigned) {
      const name = ownerNameFromRaw(rawOwner);
      if (!name) {
        continue;
      }
      const key = identifierKey(name);
      const group = byOwner.get(key) ?? { name, tasks: 0 };
      group.tasks += 1;
      byOwner.set(key, group);
    }
    const ownerNames = [...byOwner.values()].flatMap((group) => {
      const resolution = resolveOwner(candidates, group.name);
      // A matched owner has an assignee as soon as the next sync runs: not a gap.
      if (resolution.status === 'MATCHED') {
        return [];
      }
      const reason: UnresolvedReason =
        resolution.status === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'UNKNOWN';
      return [{ ...group, reason }];
    });

    return {
      ledgerNames: ledgerNames.sort(
        (a, b) => b.events - a.events || a.name.localeCompare(b.name),
      ),
      ownerNames: ownerNames.sort(
        (a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name),
      ),
    };
  }

  /**
   * The names the project's ledger carries that no registered agent answers to, for a person to register
   * one (Roadmap TASK-03): how many entries and tasks each has and when it was first and last seen, the
   * most active first. Spellings that differ only in case or spacing are one name. Read-only.
   */
  async unregistered(
    projectId: string,
    db: Db = this.prisma,
  ): Promise<UnregisteredName[]> {
    const events = await db.agentLogEvent.findMany({
      where: { projectId, agentActorId: null },
      select: {
        agentName: true,
        taskExternalId: true,
        timestampFromLog: true,
      },
    });
    const resolved = await this.resolve(
      events.map((event) => event.agentName),
      db,
    );
    const owners = await this.ownersByKey(db);

    const byKey = new Map<
      string,
      {
        spellings: Map<string, number>;
        entries: number;
        tasks: Set<string>;
        firstSeen: Date;
        lastSeen: Date;
        ambiguous: boolean;
      }
    >();
    for (const event of events) {
      // A name that resolves is one the next sync links, not a gap.
      if (resolved.get(event.agentName) !== null) {
        continue;
      }
      const key = identifierKey(event.agentName);
      const group = byKey.get(key) ?? {
        spellings: new Map<string, number>(),
        entries: 0,
        tasks: new Set<string>(),
        firstSeen: event.timestampFromLog,
        lastSeen: event.timestampFromLog,
        ambiguous: (owners.get(key)?.size ?? 0) > 1,
      };
      group.spellings.set(
        event.agentName,
        (group.spellings.get(event.agentName) ?? 0) + 1,
      );
      group.entries += 1;
      if (event.taskExternalId) {
        group.tasks.add(event.taskExternalId);
      }
      if (event.timestampFromLog < group.firstSeen) {
        group.firstSeen = event.timestampFromLog;
      }
      if (event.timestampFromLog > group.lastSeen) {
        group.lastSeen = event.timestampFromLog;
      }
      byKey.set(key, group);
    }

    return [...byKey.values()]
      .map((group) => ({
        name: [...group.spellings.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        )[0][0],
        entries: group.entries,
        tasks: group.tasks.size,
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        reason: group.ambiguous ? ('AMBIGUOUS' as const) : ('UNKNOWN' as const),
      }))
      .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));
  }

  /** Links the project's events that are still unlinked and whose name now resolves. Returns how many it linked. */
  async linkUnlinked(db: Db, projectId: string): Promise<number> {
    const unlinked = await db.agentLogEvent.groupBy({
      by: ['agentName'],
      where: { projectId, agentActorId: null },
    });
    const resolved = await this.resolve(
      unlinked.map((item) => item.agentName),
      db,
    );
    let linked = 0;
    for (const [name, actorId] of resolved) {
      if (actorId === null) {
        continue;
      }
      const { count } = await db.agentLogEvent.updateMany({
        where: { projectId, agentName: name, agentActorId: null },
        data: { agentActorId: actorId },
      });
      linked += count;
    }
    return linked;
  }

  /**
   * Makes every event agree with the agents' names as they are now, in every
   * project: links the ones that resolve and unlinks the ones that no longer do.
   * For after a change to an agent's names. Returns how many events changed.
   */
  async relinkAll(db: Db = this.prisma): Promise<number> {
    const names = await db.agentLogEvent.groupBy({ by: ['agentName'] });
    const resolved = await this.resolve(
      names.map((item) => item.agentName),
      db,
    );
    let changed = 0;
    for (const [name, actorId] of resolved) {
      const where: Prisma.AgentLogEventWhereInput = actorId
        ? {
            agentName: name,
            OR: [{ agentActorId: null }, { agentActorId: { not: actorId } }],
          }
        : { agentName: name, agentActorId: { not: null } };
      const { count } = await db.agentLogEvent.updateMany({
        where,
        data: { agentActorId: actorId },
      });
      changed += count;
    }
    return changed;
  }
}
