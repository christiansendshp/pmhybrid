import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

/** The weekly status report of a project (Roadmap TASK-48). */
export interface StatusReport {
  generatedAt: string;
  /** The week it covers, as ISO times. */
  from: string;
  to: string;
  markdown: string;
}

/** One day of the state of a project (Roadmap TASK-46); a rebuilt day (TASK-47) leaves null what it cannot know. */
export interface SnapshotDay {
  /** The UTC day, `YYYY-MM-DD`. */
  day: string;
  source: 'RECORDED' | 'RECONSTRUCTED';
  total: number;
  done: number;
  byStatus: Record<string, number> | null;
  blocked: number | null;
  openConflicts: number | null;
  progress: number | null;
}

/** The report and the history of a project (Roadmap TASK-49). */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);

  report(projectId: string): Promise<StatusReport> {
    return firstValueFrom(
      this.http.get<StatusReport>(`${API_BASE_URL}/projects/${projectId}/report`),
    );
  }

  snapshots(projectId: string, days: number): Promise<SnapshotDay[]> {
    return firstValueFrom(
      this.http.get<SnapshotDay[]>(`${API_BASE_URL}/projects/${projectId}/snapshots?days=${days}`),
    );
  }
}
