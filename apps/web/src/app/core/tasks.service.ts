import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';
import type { LedgerSpans } from './timeline.js';

export type TaskStatus = 'PENDIENTE' | 'ASIGNADA' | 'EN_DESARROLLO' | 'QA' | 'TERMINADA';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Mirrors shared-types TaskPriority, lowest first. */
export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** The columns the table of tasks can be ordered by (Roadmap TASK-18). */
export type TaskTableSort =
  | 'externalId'
  | 'title'
  | 'status'
  | 'assignee'
  | 'reviewer'
  | 'priority'
  | 'age'
  | 'dueDate'
  | 'updatedAt'
  | 'createdAt';

/** What the table of tasks is asked for: the board's filters, an order and a page. */
export interface TaskTableQuery {
  q?: string;
  assignee?: string;
  priority?: TaskPriority;
  phase?: string;
  epic?: string;
  blocked?: boolean;
  stale?: number;
  kind?: 'HUMAN' | 'AI_AGENT';
  reviewer?: string;
  divergent?: boolean;
  instant?: boolean;
  sort?: TaskTableSort;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/** One page of the table, ordered on the server over everything the filters keep. */
export interface TaskTablePage {
  total: number;
  offset: number;
  limit: number;
  sort: TaskTableSort;
  dir: 'asc' | 'desc';
  items: TaskCard[];
}

export interface Task {
  id: string;
  projectId: string;
  /** Roadmap row ID (brief §24); null until the task is written into the Roadmap. */
  externalId: string | null;
  title: string;
  description: string | null;
  /**
   * When `title` is the short one the LLM wrote for a long Roadmap title, what the
   * document holds (Roadmap GAP-39); null otherwise. Optional only so a fixture need
   * not spell the four fields out: the API always sends them.
   */
  originalTitle?: string | null;
  /** Queued, done or failed; null when the title was never long. */
  titleNormalization?: 'PENDING' | 'DONE' | 'FAILED' | null;
  /** Why it failed, already free of any secret. */
  titleNormalizationError?: string | null;
  titleNormalizedAt?: string | null;
  status: TaskStatus;
  phaseId: string | null;
  epicId: string | null;
  templateId: string | null;
  parentTaskId: string | null;
  assigneeActorId: string | null;
  priority: TaskPriority | null;
  /** What the Roadmap entry says it is (GAP, BUG, DECISION...); null for a row of a table (Roadmap GAP-35c). */
  entryType: string | null;
  progressPercent: number | null;
  acceptanceCriteria: string | null;
  startDate: string | null;
  estimatedDate: string | null;
  dueDate: string | null;
  /** When the task became TERMINADA; null while it is not (Roadmap GAP-36d). */
  completedAt: string | null;
  /** When the task entered its current status; its creation time for one that has not moved (Roadmap TASK-11). */
  statusChangedAt: string;
  /** Closed within minutes of its first IN_PROGRESS in the ledger: the board could not show it in development (Roadmap TASK-12). */
  instantClose: boolean;
  /** The row of the task left the Roadmap with nothing in the ledger to say why, and the conflict about it is open (Roadmap GAP-47). */
  rowGone: boolean;
  /** The stage the ledger's latest entry gives the task, as of the last sync; null when it says nothing (Roadmap TASK-14). */
  ledgerStage: TaskStatus | null;
  /** The start of the summary of the ledger's latest entry for the task, for the card to show (Roadmap TASK-13). */
  ledgerNote: string | null;
  /** Who was asked to review the task while it is in QA, and since when (Roadmap SUBTASK-09.1); null otherwise. */
  reviewerActorId: string | null;
  reviewRequestedAt: string | null;
  roadmapTable: 'ACTIVE' | 'NEAR_TERM' | 'BLOCKED' | null;
  createdAt: string;
  updatedAt: string;
}

/** A task as the board lists it (brief §15): the task plus what its card shows at a glance. */
export interface TaskCard extends Task {
  blockedReason: string | null;
  /** When the task entered the Roadmap's Blocked table; null while it is not in it (Roadmap TASK-31). */
  blockedSince: string | null;
  assignee: {
    id: string;
    displayName: string;
    kind: 'HUMAN' | 'AI_AGENT';
    /** The model of an agent, when it has one (Roadmap TASK-13). */
    model?: string | null;
  } | null;
  reviewer: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT' } | null;
  computedProgress: number;
  subtaskCounts: { total: number; done: number };
  /** `open` counts dependencies whose task is not TERMINADA yet. */
  dependencyCounts: { total: number; open: number };
}

export interface TaskDetail extends Task {
  /** Why a BLOCKED task is blocked, and the decision or event it waits for (Roadmap UX-03c1). */
  blockedReason: string | null;
  neededDecision: string | null;
  blockedSince: string | null;
  computedProgress: number;
  subtasks: Task[];
  dependencies: {
    id: string;
    dependsOnTaskId: string | null;
    rawExternalRef: string | null;
    dependsOnTask: { id: string; title: string; status: TaskStatus } | null;
  }[];
  assignments: {
    id: string;
    actorId: string;
    assignedAt: string;
    actor: { displayName: string };
  }[];
  assignee: { id: string; displayName: string; kind: string; model: string | null } | null;
  reviewer: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT' } | null;
  agentLogEvents: {
    id: string;
    agentName: string;
    statusWord: string;
    summary: string;
    timestampFromLog: string;
    createdAt: string;
  }[];
}

/** Brief §9: title and acceptance criteria are required; everything else is optional. */
export interface CreateTaskInput {
  title: string;
  acceptanceCriteria: string;
  description?: string;
  phaseId?: string;
  epicId?: string;
  templateId?: string;
  parentTaskId?: string;
  priority?: TaskPriority;
  progressPercent?: number;
  startDate?: string;
  estimatedDate?: string;
  dueDate?: string;
}

/** PATCH body: `null` clears an optional field; title and acceptance criteria can change but not be cleared. */
export type UpdateTaskInput = {
  [K in Exclude<keyof CreateTaskInput, 'title' | 'acceptanceCriteria'>]?: CreateTaskInput[K] | null;
} & { title?: string; acceptanceCriteria?: string };

export interface ProgressTaskNode {
  kind: 'TASK';
  id: string;
  name: string;
  status: TaskStatus;
  progress: number;
  /** This task plus every descendant subtask, by status. */
  statusCounts: StatusCounts;
  subtasks: ProgressTaskNode[];
}

/** One count per Kanban status (brief §16 "conteos por estado"). */
export type StatusCounts = Record<TaskStatus, number>;

export interface ProgressEpicNode {
  kind: 'EPIC';
  id: string;
  name: string;
  progress: number | null;
  statusCounts: StatusCounts;
  tasks: ProgressTaskNode[];
}

export interface ProgressPhaseNode {
  kind: 'PHASE';
  id: string;
  name: string;
  progress: number | null;
  statusCounts: StatusCounts;
  epics: ProgressEpicNode[];
  tasks: ProgressTaskNode[];
}

export interface ProjectProgressTree {
  project: number | null;
  statusCounts: StatusCounts;
  phases: ProgressPhaseNode[];
  epics: ProgressEpicNode[];
  tasks: ProgressTaskNode[];
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);

  getProjectProgress(projectId: string): Promise<ProjectProgressTree> {
    return firstValueFrom(
      this.http.get<ProjectProgressTree>(`${API_BASE_URL}/projects/${projectId}/progress`),
    );
  }

  /**
   * Every task of the project, read a page at a time (Roadmap IMPROVEMENT-01d3): the
   * API returns at most a page and says in `X-Next-Cursor` where the next starts, so a
   * board of any size is whole here and never silently cut.
   */
  async listForProject(
    projectId: string,
    filters: { status?: TaskStatus } = {},
  ): Promise<TaskCard[]> {
    const cards: TaskCard[] = [];
    let cursor: string | null = null;
    do {
      const params: Record<string, string> = {
        ...(filters.status ? { status: filters.status } : {}),
        ...(cursor ? { cursor } : {}),
      };
      const response: HttpResponse<TaskCard[]> = await firstValueFrom(
        this.http.get<TaskCard[]>(`${API_BASE_URL}/projects/${projectId}/tasks`, {
          observe: 'response',
          ...(Object.keys(params).length > 0 ? { params } : {}),
        }),
      );
      cards.push(...(response.body ?? []));
      cursor = response.headers.get('X-Next-Cursor');
    } while (cursor);
    return cards;
  }

  /** One page of the tasks as a table, filtered like the board and ordered on the server (Roadmap TASK-18). */
  table(projectId: string, query: TaskTableQuery): Promise<TaskTablePage> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== false && value !== '') {
        params[key] = value === true ? '1' : String(value);
      }
    }
    return firstValueFrom(
      this.http.get<TaskTablePage>(`${API_BASE_URL}/projects/${projectId}/task-table`, {
        params,
      }),
    );
  }

  getById(projectId: string, taskId: string): Promise<TaskDetail> {
    return firstValueFrom(
      this.http.get<TaskDetail>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`),
    );
  }

  /** With a key, a repeat of this same creation (after a timeout) returns the first task instead of making another (Roadmap BUG-07b). */
  create(projectId: string, input: CreateTaskInput, idempotencyKey?: string): Promise<Task> {
    return firstValueFrom(
      this.http.post<Task>(
        `${API_BASE_URL}/projects/${projectId}/tasks`,
        input,
        idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {},
      ),
    );
  }

  update(projectId: string, taskId: string, input: UpdateTaskInput): Promise<Task> {
    return firstValueFrom(
      this.http.patch<Task>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`, input),
    );
  }

  assign(projectId: string, taskId: string, actorId: string): Promise<Task> {
    return firstValueFrom(
      this.http.post<Task>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/assign`, {
        actorId,
      }),
    );
  }

  /** A comment on a task, by the person who is signed in (Roadmap TASK-19: the reason a review was rejected). */
  addComment(projectId: string, taskId: string, body: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/comments`, { body }),
    );
  }

  /** Soft delete (brief §25): the task leaves the board and its Roadmap row is taken out. */
  remove(projectId: string, taskId: string): Promise<Task> {
    return firstValueFrom(
      this.http.delete<Task>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`),
    );
  }

  /**
   * `reviewerActorId` asks someone to review the task and goes only with the move to QA (Roadmap
   * SUBTASK-09.1). `note` goes with the move to QA or the answer to it, a return or an approval, and
   * is written into the ledger of a project that records the QA handoff (Roadmap TASK-08, TASK-28).
   */
  transition(
    projectId: string,
    taskId: string,
    status: TaskStatus,
    reviewerActorId?: string | null,
    note?: string | null,
  ): Promise<Task> {
    return firstValueFrom(
      this.http.post<Task>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/transition`, {
        status,
        ...(reviewerActorId ? { reviewerActorId } : {}),
        ...(note ? { note } : {}),
      }),
    );
  }

  /** The members who may be asked to review a task: those who may approve QA (Roadmap SUBTASK-09.3). */
  reviewers(
    projectId: string,
  ): Promise<{ id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT' }[]> {
    return firstValueFrom(
      this.http.get<{ id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT' }[]>(
        `${API_BASE_URL}/projects/${projectId}/reviewers`,
      ),
    );
  }

  /** When the ledger says each task of the project was first started and last closed, by Roadmap ID (Roadmap TASK-23). */
  async spans(projectId: string): Promise<LedgerSpans> {
    const { spans } = await firstValueFrom(
      this.http.get<{ spans: LedgerSpans }>(`${API_BASE_URL}/projects/${projectId}/metrics/spans`),
    );
    return spans;
  }

  /** Asks for one task's title to be normalized again; the work runs in the background and `processing` says whether the LLM is ready to do it now (Roadmap GAP-39). */
  normalizeTitle(
    projectId: string,
    taskId: string,
  ): Promise<{ queued: boolean; processing: boolean }> {
    return firstValueFrom(
      this.http.post<{ queued: boolean; processing: boolean }>(
        `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/normalize-title`,
        {},
      ),
    );
  }

  /** Queues the project's failed normalizations and the long titles never queued (Roadmap GAP-39). */
  normalizeProjectTitles(
    projectId: string,
  ): Promise<{ retried: number; queued: number; processing: boolean }> {
    return firstValueFrom(
      this.http.post<{ retried: number; queued: number; processing: boolean }>(
        `${API_BASE_URL}/projects/${projectId}/titles/normalize`,
        {},
      ),
    );
  }

  /** Takes one dependency off a task, and out of the Roadmap row's "Depends on" (Roadmap IMPROVEMENT-01d2). */
  removeDependency(projectId: string, taskId: string, dependencyId: string): Promise<unknown> {
    return firstValueFrom(
      this.http.delete(
        `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/dependencies/${dependencyId}`,
      ),
    );
  }

  addDependency(
    projectId: string,
    taskId: string,
    dependsOnTaskId: string,
  ): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(
        `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/dependencies`,
        { dependsOnTaskId },
      ),
    );
  }
}
