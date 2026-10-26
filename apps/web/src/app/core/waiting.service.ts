import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

/** One thing a project waits for, as the API lists it (Roadmap TASK-32). Dates arrive as ISO strings. */
export type WaitingItem =
  | {
      kind: 'BLOCKED';
      since: string;
      taskId: string;
      externalId: string | null;
      title: string;
      reason: string | null;
      neededDecision: string | null;
      /** Whom the ledger says it waits for. */
      from: string | null;
      /** How many unfinished tasks depend on it. */
      holds: number;
    }
  | {
      kind: 'DECISION';
      since: string;
      taskId: string;
      externalId: string | null;
      title: string;
      from: string | null;
    }
  | {
      kind: 'CONFLICT';
      since: string;
      conflictId: string;
      conflictKind: string;
      taskId: string | null;
      externalId: string | null;
      title: string | null;
    };

/** How many blocked tasks a phase or an epic has; `id` and `name` are null for the ones that belong to none. */
export interface BlockedCount {
  id: string | null;
  name: string | null;
  blocked: number;
}

export interface Waiting {
  items: WaitingItem[];
  byPhase: BlockedCount[];
  byEpic: BlockedCount[];
  /** The ledger could not be read, so the decisions it says wait on someone are missing. */
  ledgerUnreadable: boolean;
}

/** What the project waits for, in one list (Roadmap TASK-21, TASK-32). */
@Injectable({ providedIn: 'root' })
export class WaitingService {
  private readonly http = inject(HttpClient);

  get(projectId: string): Promise<Waiting> {
    return firstValueFrom(this.http.get<Waiting>(`${API_BASE_URL}/projects/${projectId}/waiting`));
  }
}
