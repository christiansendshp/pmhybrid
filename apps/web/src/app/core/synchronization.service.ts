import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

/** A Roadmap entry the run could not read (Roadmap BUG-05): which one, where in the file, and why. */
export interface SyncEntryError {
  id: string;
  line: number;
  reason: string;
}

export interface SyncRunSummary {
  documentsChanged?: number;
  tasksCreated?: number;
  tasksUpdated?: number;
  tableChanged?: number;
  completedViaRemoval?: number;
  conflictsRaised?: number;
  dependenciesLinked?: number;
  /** Absent on runs recorded before entries were isolated. */
  entryErrors?: SyncEntryError[];
  /** Only on a FAILED run: one readable line. */
  error?: string;
}

export interface SyncRun {
  id: string;
  projectId: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: 'SCHEDULED' | 'MANUAL';
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RUNNING';
  summary: SyncRunSummary | null;
}

export type ConflictKind =
  | 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG'
  | 'CONCURRENT_FIELD_EDIT'
  | 'WRITE_BACK_COLLISION'
  | 'UNRECOGNIZED_STATUS';

export type ConflictResolutionKind = 'KEEP_LOCAL' | 'KEEP_EXTERNAL' | 'MANUAL_EDIT' | 'DISMISSED';

export interface Conflict {
  id: string;
  projectId: string;
  kind: ConflictKind;
  entityType: string;
  entityId: string;
  localVersion: Record<string, unknown>;
  externalVersion: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedByActorId: string | null;
  resolutionStrategy: ConflictResolutionKind | null;
}

@Injectable({ providedIn: 'root' })
export class SynchronizationService {
  private readonly http = inject(HttpClient);

  triggerSync(projectId: string): Promise<SyncRun> {
    return firstValueFrom(
      this.http.post<SyncRun>(`${API_BASE_URL}/projects/${projectId}/sync`, {}),
    );
  }

  listSyncRuns(projectId: string): Promise<SyncRun[]> {
    return firstValueFrom(
      this.http.get<SyncRun[]>(`${API_BASE_URL}/projects/${projectId}/sync-runs`),
    );
  }

  listConflicts(projectId: string, resolved?: boolean): Promise<Conflict[]> {
    const suffix = resolved === undefined ? '' : `?resolved=${resolved}`;
    return firstValueFrom(
      this.http.get<Conflict[]>(`${API_BASE_URL}/projects/${projectId}/conflicts${suffix}`),
    );
  }

  resolveConflict(
    projectId: string,
    conflictId: string,
    strategy: ConflictResolutionKind,
    manualValue?: Record<string, unknown>,
  ): Promise<Conflict> {
    return firstValueFrom(
      this.http.post<Conflict>(
        `${API_BASE_URL}/projects/${projectId}/conflicts/${conflictId}/resolve`,
        {
          strategy,
          manualValue,
        },
      ),
    );
  }
}
