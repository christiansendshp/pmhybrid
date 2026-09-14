import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';
import { TaskStatus } from './tasks.service.js';

export interface WorkloadRow {
  actor: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT' };
  task: { id: string; title: string; phaseId: string | null; epicId: string | null };
  project: { id: string; name: string };
  status: TaskStatus;
  progress: number;
}

export interface WorkloadFilters {
  projectId?: string;
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
