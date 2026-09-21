import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export type TaskStatus = 'PENDIENTE' | 'ASIGNADA' | 'EN_DESARROLLO' | 'QA' | 'TERMINADA';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Mirrors shared-types TaskPriority, lowest first. */
export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export interface Task {
  id: string;
  projectId: string;
  /** Roadmap row ID (brief §24); null until the task is written into the Roadmap. */
  externalId: string | null;
  title: string;
  description: string | null;
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
  roadmapTable: 'ACTIVE' | 'NEAR_TERM' | 'BLOCKED' | null;
  createdAt: string;
  updatedAt: string;
}

/** A task as the board lists it (brief §15): the task plus what its card shows at a glance. */
export interface TaskCard extends Task {
  blockedReason: string | null;
  assignee: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT' } | null;
  computedProgress: number;
  subtaskCounts: { total: number; done: number };
  /** `open` counts dependencies whose task is not TERMINADA yet. */
  dependencyCounts: { total: number; open: number };
}

export interface TaskDetail extends Task {
  /** Why a BLOCKED task is blocked, and the decision or event it waits for (Roadmap UX-03c1). */
  blockedReason: string | null;
  neededDecision: string | null;
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
  assignee: { id: string; displayName: string; kind: string } | null;
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

  listForProject(projectId: string): Promise<TaskCard[]> {
    return firstValueFrom(this.http.get<TaskCard[]>(`${API_BASE_URL}/projects/${projectId}/tasks`));
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

  /** Soft delete (brief §25): the task leaves the board and its Roadmap row is taken out. */
  remove(projectId: string, taskId: string): Promise<Task> {
    return firstValueFrom(
      this.http.delete<Task>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`),
    );
  }

  transition(projectId: string, taskId: string, status: TaskStatus): Promise<Task> {
    return firstValueFrom(
      this.http.post<Task>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/transition`, {
        status,
      }),
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
