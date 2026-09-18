import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  docsPath: string;
  syncIntervalMinutes: number;
  progressRollupStrategy: string;
  status: string;
  createdAt: string;
}

/** ACTIVE projects sync on their schedule; PAUSED and ARCHIVED ones do not. */
export type ProjectStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export const PROJECT_STATUSES: readonly ProjectStatus[] = ['ACTIVE', 'PAUSED', 'ARCHIVED'];

/**
 * Brief §16-17: how a parent's progress is rolled up from its children.
 * `LEAF_EQUAL_WEIGHT` is accepted end-to-end (validated, stored, selectable
 * here) but ProgressRollupService only implements EQUAL_WEIGHT_AVERAGE's
 * math today (docs/architecture.md) — selecting it records the intent
 * without yet changing a computed number.
 */
export type ProgressRollupStrategy = 'EQUAL_WEIGHT_AVERAGE' | 'LEAF_EQUAL_WEIGHT';

export const PROGRESS_ROLLUP_STRATEGIES: readonly ProgressRollupStrategy[] = [
  'EQUAL_WEIGHT_AVERAGE',
  'LEAF_EQUAL_WEIGHT',
];

export const PROGRESS_ROLLUP_STRATEGY_LABELS: Record<ProgressRollupStrategy, string> = {
  EQUAL_WEIGHT_AVERAGE: 'Promedio de peso igual',
  LEAF_EQUAL_WEIGHT: 'Peso igual entre hojas',
};

/** Brief §19: what My Projects shows for each project. */
export interface ProjectSummary {
  progress: number | null;
  /** ASIGNADA, EN_DESARROLLO or QA. */
  activeTasks: number;
  /** Past their due date and not TERMINADA. */
  overdueTasks: number;
  /** Active AI agents assigned to active tasks. */
  activeAgents: number;
  openConflicts: number;
  lastSyncRun: { status: string; startedAt: string; finishedAt: string | null } | null;
}

export interface ProjectWithSummary extends Project {
  summary: ProjectSummary;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  repoUrl?: string;
  docsPath: string;
  progressRollupStrategy?: ProgressRollupStrategy;
}

/** `null` clears the description or repository URL. */
export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  repoUrl?: string | null;
  docsPath?: string;
  syncIntervalMinutes?: number;
  status?: ProjectStatus;
  progressRollupStrategy?: ProgressRollupStrategy;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  actorId: string;
  joinedAt: string;
  isActive: boolean;
  actor: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT'; email: string | null };
}

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);

  listMine(): Promise<ProjectWithSummary[]> {
    return firstValueFrom(this.http.get<ProjectWithSummary[]>(`${API_BASE_URL}/projects`));
  }

  update(projectId: string, input: UpdateProjectInput): Promise<Project> {
    return firstValueFrom(this.http.patch<Project>(`${API_BASE_URL}/projects/${projectId}`, input));
  }

  getById(projectId: string): Promise<Project> {
    return firstValueFrom(this.http.get<Project>(`${API_BASE_URL}/projects/${projectId}`));
  }

  create(input: CreateProjectInput): Promise<Project> {
    return firstValueFrom(this.http.post<Project>(`${API_BASE_URL}/projects`, input));
  }

  listMembers(projectId: string): Promise<ProjectMember[]> {
    return firstValueFrom(
      this.http.get<ProjectMember[]>(`${API_BASE_URL}/projects/${projectId}/members`),
    );
  }

  addMember(projectId: string, actorId: string): Promise<ProjectMember> {
    return firstValueFrom(
      this.http.post<ProjectMember>(`${API_BASE_URL}/projects/${projectId}/members`, { actorId }),
    );
  }

  removeMember(projectId: string, actorId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API_BASE_URL}/projects/${projectId}/members/${actorId}`),
    );
  }

  myPermissions(projectId: string): Promise<string[]> {
    return firstValueFrom(
      this.http.get<string[]>(`${API_BASE_URL}/projects/${projectId}/roles/my-permissions`),
    );
  }
}
