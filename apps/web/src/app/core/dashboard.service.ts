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

export interface DashboardActivity {
  recentlyModifiedTasks: { id: string; title: string; status: string; updatedAt: string }[];
  recentStatusChanges: {
    id: string;
    entityId: string;
    previousValue: { status: string } | null;
    newValue: { status: string } | null;
    occurredAt: string;
  }[];
  recentAssignments: {
    id: string;
    assignedAt: string;
    task: { id: string; title: string };
    actor: { displayName: string };
  }[];
  recentAgentEvents: {
    id: string;
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
    document: { kind: string };
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
