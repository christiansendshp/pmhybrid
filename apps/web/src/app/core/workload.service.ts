import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';
import { TaskStatus } from './tasks.service.js';

export interface WorkloadRow {
  actor: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT'; isActive: boolean };
  /** Null on an idle row: an active member with nothing assigned. */
  task: { id: string; title: string; phaseId: string | null; epicId: string | null } | null;
  project: { id: string; name: string } | null;
  status: TaskStatus | null;
  progress: number | null;
}

/** Brief §18 filters. Idle rows are only included while no status, phase or epic filter is set. */
export interface WorkloadFilters {
  projectId?: string;
  kind?: 'HUMAN' | 'AI_AGENT';
  actorId?: string;
  status?: TaskStatus;
  phaseId?: string;
  epicId?: string;
}

/** "¿Quién está haciendo qué?" (brief §18) — cross-project by default. */
@Injectable({ providedIn: 'root' })
export class WorkloadService {
  private readonly http = inject(HttpClient);

  getWorkload(filters: WorkloadFilters): Promise<WorkloadRow[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }
    const query = params.toString();
    return firstValueFrom(
      this.http.get<WorkloadRow[]>(`${API_BASE_URL}/workload${query ? '?' + query : ''}`),
    );
  }
}
