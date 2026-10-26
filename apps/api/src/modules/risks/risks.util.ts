/** The signals a project can show about its open work (Roadmap TASK-43). */
export type RiskKind =
  | 'UNOWNED_IN_DEVELOPMENT'
  | 'BLOCKED_BY_BLOCKED'
  | 'STALE_IN_DEVELOPMENT'
  | 'OVERDUE';

/** A task as the risks need it. Every field is something the database already holds. */
export interface RiskTask {
  id: string;
  externalId: string | null;
  title: string;
  status: string;
  /** Somebody holds it: an assignee, or an owner written in the row. */
  hasOwner: boolean;
  /** It sits in the Roadmap's Blocked table. */
  blocked: boolean;
  dueDate: Date | null;
  /** The latest of its status change, its ledger entries and its comments. */
  lastActivityAt: Date;
  phaseId: string | null;
  epicId: string | null;
}

/** `taskId` cannot start before `dependsOnTaskId` is done. */
export interface RiskDependency {
  taskId: string;
  dependsOnTaskId: string;
}

/** Enough of a task to name it and open it. */
export interface RiskRef {
  id: string;
  externalId: string | null;
  title: string;
}

/** One thing that is wrong, about one task, and what to say about it. */
export interface RiskSignal {
  kind: RiskKind;
  task: RiskRef;
  /** BLOCKED_BY_BLOCKED: the tasks it depends on that are blocked. */
  blockedBy?: RiskRef[];
  /** STALE_IN_DEVELOPMENT: whole hours since the last activity. */
  idleHours?: number;
  /** OVERDUE: the date it was due, as an ISO time. */
  dueDate?: string;
}

/** A step of the critical path: a task, and where it stands. */
export interface CriticalStep {
  task: RiskRef;
  status: string;
}

export type Light = 'RED' | 'AMBER' | 'GREEN';

/** How a group of open tasks is doing, with the counts that say why. */
export interface Semaphore {
  /** Null when nothing is open: a finished or empty phase has no light. */
  light: Light | null;
  open: number;
  /** Open tasks in the Blocked table. */
  blocked: number;
  counts: Record<RiskKind, number>;
}

export interface Risks {
  signals: RiskSignal[];
  /** The longest chain of open tasks by dependency, the first to do first; empty when no task waits on another. */
  criticalPath: CriticalStep[];
  project: Semaphore;
  byPhase: ({ phaseId: string } & Semaphore)[];
  byEpic: ({ epicId: string } & Semaphore)[];
}

const HOUR = 60 * 60 * 1000;
const DEVELOPMENT = 'EN_DESARROLLO';
const DONE = 'TERMINADA';

const refOf = ({ id, externalId, title }: RiskTask): RiskRef => ({
  id,
  externalId,
  title,
});

/** Stable order for ties, so the same project always gives the same answer. */
const byName = (a: RiskTask, b: RiskTask): number =>
  (a.externalId ?? '').localeCompare(b.externalId ?? '') ||
  a.id.localeCompare(b.id);

/**
 * The signals, the critical path and the semaphores of a project (Roadmap TASK-43). Pure: the caller gives the tasks
 * (deleted ones and the cards that are not work out), their dependencies and the moment it is read. Each signal is a
 * rule that cannot be wrong about the data it reads, and says why; nothing is guessed.
 */
export function risksOf(input: {
  tasks: readonly RiskTask[];
  dependencies: readonly RiskDependency[];
  now: Date;
  staleAfterHours: number;
}): Risks {
  const { tasks, dependencies, now, staleAfterHours } = input;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const open = tasks.filter((task) => task.status !== DONE).sort(byName);
  const isOpen = (id: string): RiskTask | undefined => {
    const task = byId.get(id);
    return task && task.status !== DONE ? task : undefined;
  };

  const waitsOn = new Map<string, RiskTask[]>();
  for (const { taskId, dependsOnTaskId } of dependencies) {
    const dependent = isOpen(taskId);
    const dependency = isOpen(dependsOnTaskId);
    if (dependent && dependency && dependent.id !== dependency.id) {
      waitsOn.set(dependent.id, [
        ...(waitsOn.get(dependent.id) ?? []),
        dependency,
      ]);
    }
  }

  const signals: RiskSignal[] = [];
  for (const task of open) {
    if (task.status === DEVELOPMENT && !task.hasOwner) {
      signals.push({ kind: 'UNOWNED_IN_DEVELOPMENT', task: refOf(task) });
    }
    const blockers = (waitsOn.get(task.id) ?? []).filter(
      (dependency) => dependency.blocked,
    );
    if (blockers.length > 0) {
      signals.push({
        kind: 'BLOCKED_BY_BLOCKED',
        task: refOf(task),
        blockedBy: [...blockers].sort(byName).map(refOf),
      });
    }
    const idle = now.getTime() - task.lastActivityAt.getTime();
    if (task.status === DEVELOPMENT && idle > staleAfterHours * HOUR) {
      signals.push({
        kind: 'STALE_IN_DEVELOPMENT',
        task: refOf(task),
        idleHours: Math.floor(idle / HOUR),
      });
    }
    if (task.dueDate && task.dueDate.getTime() < now.getTime()) {
      signals.push({
        kind: 'OVERDUE',
        task: refOf(task),
        dueDate: task.dueDate.toISOString(),
      });
    }
  }

  const semaphoreOf = (group: readonly RiskTask[]): Semaphore => {
    const ids = new Set(group.map((task) => task.id));
    const counts: Record<RiskKind, number> = {
      UNOWNED_IN_DEVELOPMENT: 0,
      BLOCKED_BY_BLOCKED: 0,
      STALE_IN_DEVELOPMENT: 0,
      OVERDUE: 0,
    };
    for (const signal of signals) {
      if (ids.has(signal.task.id)) {
        counts[signal.kind] += 1;
      }
    }
    const blocked = group.filter((task) => task.blocked).length;
    const light: Light | null =
      group.length === 0
        ? null
        : counts.OVERDUE > 0 || counts.BLOCKED_BY_BLOCKED > 0
          ? 'RED'
          : counts.UNOWNED_IN_DEVELOPMENT > 0 ||
              counts.STALE_IN_DEVELOPMENT > 0 ||
              blocked > 0
            ? 'AMBER'
            : 'GREEN';
    return { light, open: group.length, blocked, counts };
  };

  const phaseIds = [
    ...new Set(tasks.flatMap((task) => (task.phaseId ? [task.phaseId] : []))),
  ].sort();
  const epicIds = [
    ...new Set(tasks.flatMap((task) => (task.epicId ? [task.epicId] : []))),
  ].sort();

  return {
    signals,
    criticalPath: criticalPathOf(open, waitsOn),
    project: semaphoreOf(open),
    byPhase: phaseIds.map((phaseId) => ({
      phaseId,
      ...semaphoreOf(open.filter((task) => task.phaseId === phaseId)),
    })),
    byEpic: epicIds.map((epicId) => ({
      epicId,
      ...semaphoreOf(open.filter((task) => task.epicId === epicId)),
    })),
  };
}

/**
 * The longest chain of open tasks by dependency: the one that cannot be shorter than its length however many people
 * work. A dependency on a finished task is not in `waitsOn`, so it lengthens nothing. An edge that would close a cycle
 * is ignored rather than followed. A single task with nothing to wait for is not a chain: the answer is empty then.
 */
function criticalPathOf(
  open: readonly RiskTask[],
  waitsOn: ReadonlyMap<string, readonly RiskTask[]>,
): CriticalStep[] {
  const depth = new Map<string, number>();
  const previous = new Map<string, RiskTask>();
  const visiting = new Set<string>();

  const depthOf = (task: RiskTask): number => {
    const known = depth.get(task.id);
    if (known !== undefined) {
      return known;
    }
    visiting.add(task.id);
    let best = 0;
    let via: RiskTask | undefined;
    for (const dependency of [...(waitsOn.get(task.id) ?? [])].sort(byName)) {
      if (visiting.has(dependency.id)) {
        continue;
      }
      const length = depthOf(dependency);
      if (length > best) {
        best = length;
        via = dependency;
      }
    }
    visiting.delete(task.id);
    depth.set(task.id, best + 1);
    if (via) {
      previous.set(task.id, via);
    }
    return best + 1;
  };

  let last: RiskTask | undefined;
  let longest = 0;
  for (const task of open) {
    const length = depthOf(task);
    if (length > longest) {
      longest = length;
      last = task;
    }
  }
  if (!last || longest < 2) {
    return [];
  }
  const path: CriticalStep[] = [];
  for (
    let step: RiskTask | undefined = last;
    step;
    step = previous.get(step.id)
  ) {
    path.unshift({ task: refOf(step), status: step.status });
  }
  return path;
}
