import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export type TaskStatus = 'PENDIENTE' | 'ASIGNADA' | 'EN_DESARROLLO' | 'QA' | 'TERMINADA';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  phaseId: string | null;
  epicId: string | null;
  parentTaskId: string | null;
  assigneeActorId: string | null;
  priority: string | null;
  progressPercent: number | null;
  createdAt: string;
}

export interface TaskDetail extends Task {
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
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  phaseId?: string;
  epicId?: string;
  templateId?: string;
  parentTaskId?: string;
  priority?: string;
  progressPercent?: number;
}

export interface ProgressTaskNode {
  kind: 'TASK';
  id: string;
  name: string;
  progress: number;
}

export interface ProgressEpicNode {
  kind: 'EPIC';
  id: string;
  name: string;
  progress: number | null;
  tasks: ProgressTaskNode[];
}

export interface ProgressPhaseNode {
  kind: 'PHASE';
  id: string;
  name: string;
  progress: number | null;
  epics: ProgressEpicNode[];
  tasks: ProgressTaskNode[];
}

export interface ProjectProgressTree {
  project: number | null;
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

  listForProject(projectId: string): Promise<Task[]> {
    return firstValueFrom(this.http.get<Task[]>(`${API_BASE_URL}/projects/${projectId}/tasks`));
  }

  getById(projectId: string, taskId: string): Promise<TaskDetail> {
    return firstValueFrom(
      this.http.get<TaskDetail>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`),
    );
  }

  create(projectId: string, input: CreateTaskInput): Promise<Task> {
    return firstValueFrom(
      this.http.post<Task>(`${API_BASE_URL}/projects/${projectId}/tasks`, input),
    );
  }

  assign(projectId: string, taskId: string, actorId: string): Promise<Task> {
    return firstValueFrom(
      this.http.post<Task>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/assign`, {
        actorId,
      }),
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
