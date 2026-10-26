import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export type RiskKind =
  'UNOWNED_IN_DEVELOPMENT' | 'BLOCKED_BY_BLOCKED' | 'STALE_IN_DEVELOPMENT' | 'OVERDUE';

/** Enough of a task to name it and open it. */
export interface RiskRef {
  id: string;
  externalId: string | null;
  title: string;
}

/** One thing that is wrong, about one task (Roadmap TASK-44). */
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

/** An open task that waits for other open tasks, and which (Roadmap TASK-22). */
export interface WaitingTask {
  task: RiskRef;
  status: string;
  waitsOn: { task: RiskRef; status: string; blocked: boolean }[];
}

export interface CriticalStep {
  task: RiskRef;
  status: string;
}

export type Light = 'RED' | 'AMBER' | 'GREEN';

/** How a group of open tasks is doing, with the counts that say why. `light` is null when nothing is open. */
export interface Semaphore {
  light: Light | null;
  open: number;
  blocked: number;
  counts: Record<RiskKind, number>;
}

export interface ProjectRisks {
  generatedAt: string;
  /** The hours without activity that make a task in development stale. */
  staleAfterHours: number;
  signals: RiskSignal[];
  criticalPath: CriticalStep[];
  /** What blocks what: every open task that waits for another open one, the one waiting for most first. */
  waiting: WaitingTask[];
  project: Semaphore;
  phases: { phaseId: string; name: string; semaphore: Semaphore }[];
  epics: { epicId: string; name: string; semaphore: Semaphore }[];
}

/** What is going wrong in a project (Roadmap TASK-45). */
@Injectable({ providedIn: 'root' })
export class RisksService {
  private readonly http = inject(HttpClient);

  get(projectId: string): Promise<ProjectRisks> {
    return firstValueFrom(
      this.http.get<ProjectRisks>(`${API_BASE_URL}/projects/${projectId}/risks`),
    );
  }
}
