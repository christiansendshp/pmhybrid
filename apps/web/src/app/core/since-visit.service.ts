import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

/** Enough of a task to name it and open it. */
export interface NewsTask {
  id: string;
  externalId: string | null;
  title: string;
}

/** One kind of news: how many tasks, and the first of them. */
export interface NewsKind {
  count: number;
  tasks: NewsTask[];
}

/** What happened in one project since the person last marked it as seen (Roadmap TASK-38). */
export interface ProjectNews {
  projectId: string;
  name: string;
  /** Where the count starts, as an ISO time. */
  since: string;
  done: NewsKind;
  blocked: NewsKind;
  unblocked: NewsKind;
  newScope: NewsKind;
  conflicts: number;
}

export interface SinceLastVisit {
  generatedAt: string;
  /** Only the projects with something new. */
  projects: ProjectNews[];
}

/** What changed since the person's last visit, and the marker they move (Roadmap TASK-38, TASK-39). */
@Injectable({ providedIn: 'root' })
export class SinceVisitService {
  private readonly http = inject(HttpClient);

  get(): Promise<SinceLastVisit> {
    return firstValueFrom(
      this.http.get<SinceLastVisit>(`${API_BASE_URL}/dashboard/since-last-visit`),
    );
  }

  /** Marks those projects as seen, or all of the person's when none is named; answers the ones it marked. */
  markSeen(projectIds?: string[]): Promise<{ projectIds: string[] }> {
    return firstValueFrom(
      this.http.post<{ projectIds: string[] }>(
        `${API_BASE_URL}/dashboard/since-last-visit/seen`,
        projectIds ? { projectIds } : {},
      ),
    );
  }
}
