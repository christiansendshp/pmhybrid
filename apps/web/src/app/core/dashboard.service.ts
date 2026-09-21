import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export interface DashboardSummary {
  activeProjects: number;
  totalTasks: number;
  pendiente: number;
  asignada: number;
  enDesarrollo: number;
  qa: number;
  terminada: number;
  blocked: number;
  globalProgress: number | null;
}

/** Enough of a task to name it and open it (Roadmap UX-03c2). */
export interface DashboardTaskRef {
  id: string;
  projectId: string;
  externalId: string | null;
  title: string;
}

export interface DashboardActivity {
  recentlyModifiedTasks: (DashboardTaskRef & { status: string; updatedAt: string })[];
  recentStatusChanges: {
    id: string;
    entityId: string;
    /** The task the change is about; changes of a removed task are not listed. */
    task: DashboardTaskRef;
    previousValue: { status: string } | null;
    newValue: { status: string } | null;
    occurredAt: string;
  }[];
  recentAssignments: {
    id: string;
    assignedAt: string;
    task: DashboardTaskRef;
    actor: { displayName: string };
  }[];
  recentAgentEvents: {
    id: string;
    projectId: string;
    /** The task the entry is about, when it names one PM Hub knows. */
    taskId: string | null;
    agentName: string;
    taskExternalId: string | null;
    statusWord: string;
    summary: string;
    createdAt: string;
  }[];
  recentDocumentChanges: {
    id: string;
    capturedAt: string;
    source: string;
    document: { kind: string; projectId: string };
  }[];
}

/** Cross-project aggregate for the current actor's memberships (brief §14). */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  getSummary(): Promise<DashboardSummary> {
    return firstValueFrom(this.http.get<DashboardSummary>(`${API_BASE_URL}/dashboard/summary`));
  }

  getActivity(): Promise<DashboardActivity> {
    return firstValueFrom(this.http.get<DashboardActivity>(`${API_BASE_URL}/dashboard/activity`));
  }
}
