import { TaskStatus } from '@pmhybrid/shared-types';

/** The fields of a task that progress depends on. */
export interface RollupTask {
  id: string;
  parentTaskId: string | null;
  phaseId: string | null;
  epicId: string | null;
  status: string;
  progressPercent: number | null;
}

export interface RollupEpic {
  id: string;
  phaseId: string | null;
}

export interface RollupPhase {
  id: string;
}

/**
 * How a project rolls its progress up (`Project.progressRollupStrategy`, Roadmap
 * GAP-36d): each level averages what sits directly under it
 * (`EQUAL_WEIGHT_AVERAGE`, the default), or every leaf task under it counts
 * once whatever its depth (`LEAF_EQUAL_WEIGHT`), so a task split into ten
 * subtasks weighs ten times what an unsplit one does.
 */
export type RollupStrategy = 'EQUAL_WEIGHT_AVERAGE' | 'LEAF_EQUAL_WEIGHT';

/**
 * EQUAL_WEIGHT_AVERAGE rollup (docs/domain-model.md, Project.progressRollupStrategy
 * default) over one project's rows, all read up front (Roadmap IMPROVEMENT-01c):
 * the service used to walk the tree with a query per node, so a project list
 * or a task list ran thousands of queries. A leaf task's progress is its
 * explicit progressPercent, falling back to a status-implied value; a parent's
 * is the unweighted average of its immediate children, recursively; an epic,
 * a phase and the project average what sits directly under them.
 *
 * `tasks` must be the project's live tasks only (a removed subtask never
 * counts towards its parent).
 */
export class ProgressCalculator {
  private readonly byId = new Map<string, RollupTask>();
  private readonly children = new Map<string, RollupTask[]>();
  private readonly topLevelByEpic = new Map<string, RollupTask[]>();
  private readonly directByPhase = new Map<string, RollupTask[]>();
  private readonly epicsByPhase = new Map<string, RollupEpic[]>();
  private readonly orphanEpics: RollupEpic[] = [];
  private readonly orphanTasks: RollupTask[] = [];
  private readonly memo = new Map<string, number>();
  private readonly leafMemo = new Map<string, number[]>();
  private readonly phaseIds: string[];

  constructor(
    tasks: readonly RollupTask[],
    epics: readonly RollupEpic[],
    phases: readonly RollupPhase[],
    private readonly strategy: RollupStrategy = 'EQUAL_WEIGHT_AVERAGE',
  ) {
    this.phaseIds = phases.map((phase) => phase.id);
    for (const task of tasks) {
      this.byId.set(task.id, task);
      if (task.parentTaskId) {
        push(this.children, task.parentTaskId, task);
      } else if (task.epicId) {
        push(this.topLevelByEpic, task.epicId, task);
      } else if (task.phaseId) {
        push(this.directByPhase, task.phaseId, task);
      } else {
        this.orphanTasks.push(task);
      }
    }
    for (const epic of epics) {
      if (epic.phaseId) {
        push(this.epicsByPhase, epic.phaseId, epic);
      } else {
        this.orphanEpics.push(epic);
      }
    }
  }

  /** The rolled-up progress of a task by id, or undefined for one that is not among this project's live tasks. */
  taskProgress(taskId: string): number | undefined {
    const task = this.byId.get(taskId);
    return task ? this.task(task) : undefined;
  }

  /** A task with subtasks is the average of their progress; a leaf its own percent, else what its status implies. */
  task(task: RollupTask): number {
    const known = this.memo.get(task.id);
    if (known !== undefined) {
      return known;
    }
    const subtasks = this.children.get(task.id);
    const value =
      !subtasks || subtasks.length === 0
        ? this.own(task)
        : this.strategy === 'LEAF_EQUAL_WEIGHT'
          ? average(this.leaves(task))
          : average(subtasks.map((subtask) => this.task(subtask)));
    this.memo.set(task.id, value);
    return value;
  }

  /** What a task with no subtask says of itself: its own percent, else what its status implies. */
  private own(task: RollupTask): number {
    return (
      task.progressPercent ??
      statusFallback(task.status as unknown as TaskStatus)
    );
  }

  /** The progress of every leaf task at or under `task` (LEAF_EQUAL_WEIGHT). */
  private leaves(task: RollupTask): number[] {
    const known = this.leafMemo.get(task.id);
    if (known) {
      return known;
    }
    const subtasks = this.children.get(task.id);
    const values =
      !subtasks || subtasks.length === 0
        ? [this.own(task)]
        : subtasks.flatMap((subtask) => this.leaves(subtask));
    this.leafMemo.set(task.id, values);
    return values;
  }

  private epicLeaves(epicId: string): number[] {
    return (this.topLevelByEpic.get(epicId) ?? []).flatMap((task) =>
      this.leaves(task),
    );
  }

  private phaseLeaves(phaseId: string): number[] {
    return [
      ...(this.epicsByPhase.get(phaseId) ?? []).flatMap((epic) =>
        this.epicLeaves(epic.id),
      ),
      ...(this.directByPhase.get(phaseId) ?? []).flatMap((task) =>
        this.leaves(task),
      ),
    ];
  }

  /** null when the epic has no top-level task. */
  epic(epicId: string): number | null {
    if (this.strategy === 'LEAF_EQUAL_WEIGHT') {
      const leaves = this.epicLeaves(epicId);
      return leaves.length === 0 ? null : average(leaves);
    }
    const tasks = this.topLevelByEpic.get(epicId) ?? [];
    return tasks.length === 0
      ? null
      : average(tasks.map((task) => this.task(task)));
  }

  /** The epics of the phase plus the tasks sitting directly in it; null when it has neither. */
  phase(phaseId: string): number | null {
    if (this.strategy === 'LEAF_EQUAL_WEIGHT') {
      const leaves = this.phaseLeaves(phaseId);
      return leaves.length === 0 ? null : average(leaves);
    }
    const epicValues = (this.epicsByPhase.get(phaseId) ?? [])
      .map((epic) => this.epic(epic.id))
      .filter(isNumber);
    const taskValues = (this.directByPhase.get(phaseId) ?? []).map((task) =>
      this.task(task),
    );
    const all = [...epicValues, ...taskValues];
    return all.length === 0 ? null : average(all);
  }

  /** Phases, then epics and tasks that belong to no phase; null for an empty project. */
  project(): number | null {
    if (this.strategy === 'LEAF_EQUAL_WEIGHT') {
      const leaves = [
        ...this.phaseIds.flatMap((id) => this.phaseLeaves(id)),
        ...this.orphanEpics.flatMap((epic) => this.epicLeaves(epic.id)),
        ...this.orphanTasks.flatMap((task) => this.leaves(task)),
      ];
      return leaves.length === 0 ? null : average(leaves);
    }
    const all = [
      ...this.phaseIds.map((id) => this.phase(id)).filter(isNumber),
      ...this.orphanEpics.map((epic) => this.epic(epic.id)).filter(isNumber),
      ...this.orphanTasks.map((task) => this.task(task)),
    ];
    return all.length === 0 ? null : average(all);
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

export function statusFallback(status: TaskStatus): number {
  switch (status) {
    case TaskStatus.PENDIENTE:
    case TaskStatus.ASIGNADA:
      return 0;
    case TaskStatus.EN_DESARROLLO:
      return 50;
    case TaskStatus.QA:
      return 80;
    case TaskStatus.TERMINADA:
      return 100;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isNumber(value: number | null): value is number {
  return value !== null;
}
