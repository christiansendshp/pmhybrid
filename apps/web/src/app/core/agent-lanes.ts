import { ProjectMember } from './projects.service.js';
import { TaskCard, TaskStatus } from './tasks.service.js';
import { WipState, countAgentWip, wipState } from './wip.js';

const STATUSES: readonly TaskStatus[] = [
  'PENDIENTE',
  'ASIGNADA',
  'EN_DESARROLLO',
  'QA',
  'TERMINADA',
];

/** One registered agent of the project, and what it holds, by stage. */
export interface AgentLane {
  actorId: string;
  name: string;
  /** The model its tasks name, when any does. */
  model: string | null;
  columns: Record<TaskStatus, TaskCard[]>;
  total: number;
  /** Its work in development against the project's limit per agent; none without a limit. */
  wip: WipState | null;
}

/** A name the documents carry that no registered agent answers to (Roadmap TASK-02). */
export interface UnregisteredName {
  name: string;
  /** How many entries of the ledger carry it. */
  events: number;
  /** How many different tasks those entries are about. */
  tasks: number;
  /** When it was first and last seen, by the agent's own clock. */
  firstSeen: string;
  lastSeen: string;
  reason: 'UNKNOWN' | 'AMBIGUOUS';
}

/**
 * The tasks of the project by agent (Roadmap TASK-20): a lane for every agent that is a member, the idle ones
 * included, so who is not working is as visible as who is. A task nobody holds, or a person holds, is in no
 * lane; how many they are is returned so the view can say so instead of hiding them.
 *
 * `cards` is every task the filters keep, and the work in development of an agent is counted from all of them:
 * a limit is about the agent's real load, and is read against `allCards` when the filters leave some out.
 */
export function agentLanes(
  cards: readonly TaskCard[],
  members: readonly ProjectMember[],
  agentLimit: number | null | undefined,
  allCards: readonly TaskCard[] = cards,
): { lanes: AgentLane[]; withoutAgent: number } {
  const agents = members
    .filter((member) => member.isActive && member.actor.kind === 'AI_AGENT')
    .map((member) => member.actor)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const lanes = agents.map((agent): AgentLane => {
    const own = cards.filter((card) => card.assignee?.id === agent.id);
    const columns = Object.fromEntries(
      STATUSES.map((status) => [
        status,
        own
          .filter((card) => card.status === status)
          .sort(
            (a, b) =>
              new Date(a.statusChangedAt).getTime() - new Date(b.statusChangedAt).getTime() ||
              a.createdAt.localeCompare(b.createdAt),
          ),
      ]),
    ) as Record<TaskStatus, TaskCard[]>;
    return {
      actorId: agent.id,
      name: agent.displayName,
      model: own.find((card) => card.assignee?.model)?.assignee?.model ?? null,
      columns,
      total: own.length,
      wip: wipState(countAgentWip(allCards, agent.id), agentLimit),
    };
  });
  const held = new Set(agents.map((agent) => agent.id));
  return {
    lanes,
    withoutAgent: cards.filter((card) => !card.assignee || !held.has(card.assignee.id)).length,
  };
}
