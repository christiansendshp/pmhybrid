import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

/** Free-form per docs/domain-model.md — currently `CONFLICTS_DETECTED`, `SYNC_FAILED` and `ROADMAP_ENTRIES_INVALID`. */
export interface Notification {
  id: string;
  actorId: string;
  projectId: string;
  type: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/** How often a person is sent the summary of what changed in their projects (Roadmap TASK-42). */
export type SummaryFrequency = 'NONE' | 'DAILY' | 'WEEKLY';

/** Internal notifications (brief §29): no push, the UI polls on demand — see docs/architecture.md. */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  list(): Promise<Notification[]> {
    return firstValueFrom(this.http.get<Notification[]>(`${API_BASE_URL}/notifications`));
  }

  /** What the person chose about being notified: theirs alone. */
  preferences(): Promise<{ summaryFrequency: SummaryFrequency }> {
    return firstValueFrom(
      this.http.get<{ summaryFrequency: SummaryFrequency }>(
        `${API_BASE_URL}/notifications/preferences`,
      ),
    );
  }

  setSummaryFrequency(
    summaryFrequency: SummaryFrequency,
  ): Promise<{ summaryFrequency: SummaryFrequency }> {
    return firstValueFrom(
      this.http.patch<{ summaryFrequency: SummaryFrequency }>(
        `${API_BASE_URL}/notifications/preferences`,
        { summaryFrequency },
      ),
    );
  }

  markAllRead(): Promise<{ count: number }> {
    return firstValueFrom(
      this.http.patch<{ count: number }>(`${API_BASE_URL}/notifications/read-all`, {}),
    );
  }

  markRead(id: string): Promise<Notification> {
    return firstValueFrom(
      this.http.patch<Notification>(`${API_BASE_URL}/notifications/${id}/read`, {}),
    );
  }
}
