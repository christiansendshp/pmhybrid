import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export const AUDIT_ORIGINS = ['UI', 'ROADMAP', 'AGENTSLOG', 'SYNC', 'API', 'SYSTEM'] as const;
export type AuditOrigin = (typeof AUDIT_ORIGINS)[number];

export interface AuditEvent {
  id: string;
  projectId: string | null;
  actorId: string | null;
  entityType: string;
  entityId: string;
  operation: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  origin: AuditOrigin;
  occurredAt: string;
  actor: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT' } | null;
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  operation?: string;
  origin?: AuditOrigin;
  /** Id of the last event already shown — the next page continues after it. */
  cursor?: string;
  limit?: number;
}

/** Read-only project change history (brief §25) — mirrors apps/api/src/modules/audit. */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);

  listForProject(projectId: string, query: AuditQuery = {}): Promise<AuditEvent[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return firstValueFrom(
      this.http.get<AuditEvent[]>(`${API_BASE_URL}/projects/${projectId}/audit`, { params }),
    );
  }
}
