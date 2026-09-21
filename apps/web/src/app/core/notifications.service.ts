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

/** Internal notifications (brief §29): no push, the UI polls on demand — see docs/architecture.md. */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  list(): Promise<Notification[]> {
    return firstValueFrom(this.http.get<Notification[]>(`${API_BASE_URL}/notifications`));
  }

  markRead(id: string): Promise<Notification> {
    return firstValueFrom(
      this.http.patch<Notification>(`${API_BASE_URL}/notifications/${id}/read`, {}),
    );
  }
}
