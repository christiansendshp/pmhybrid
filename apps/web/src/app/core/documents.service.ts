import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export const DOCUMENT_KINDS = [
  'roadmap',
  'agentslog',
  'product-description',
  'stack-tech',
  'features',
  'agents-rules',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface RawDocument {
  kind: string;
  content: string;
}

export interface ParsedRoadmapRow {
  externalId: string;
  table: 'ACTIVE' | 'NEAR_TERM' | 'BLOCKED';
  outcome?: string;
  acceptanceCheck?: string;
  statusRaw?: string;
  statusMapped?: string | null;
  rawOwner?: string;
  ownerName?: string;
  ownerClaimedAt?: string;
  dependsOnRaw?: string;
  blocker?: string;
  neededDecision?: string;
}

export interface ParsedAgentLogEntry {
  timestampFromLog: string;
  agentName: string;
  taskExternalId: string;
  statusWord: string;
  summary: string;
  files: string;
  verify: string;
  followUp: string;
  rawEntryHash: string;
}

export interface ParsedAgentslog {
  entries: ParsedAgentLogEntry[];
  previousSegment?: { archivePath: string; sha256: string };
}

/** One status word of the ledger and what PM Hub reads it as (Roadmap TASK-30); `OTHER` is a word it does not know. */
export interface LedgerWord {
  word: string;
  canonicalStatus: string | null;
  entries: number;
  qualifier: string | null;
}

/** An ID the ledger works on that is no task of the project (Roadmap TASK-33). */
export interface UntrackedWork {
  externalId: string;
  entries: number;
  agents: string[];
  firstSeen: string;
  lastSeen: string;
  /** The status word of its latest entry, as written. */
  lastWord: string;
  /** Whether that entry is the exact DONE. */
  closed: boolean;
}

/** What importing closed ledger work did: the tasks it made and the IDs it left, with why (Roadmap TASK-34). */
export interface UntrackedImportResult {
  imported: { externalId: string; taskId: string; title: string }[];
  skipped: { externalId: string; reason: 'NOT_LISTED' | 'OPEN' }[];
}

export type RevisionSource = 'SYNC' | 'UI' | 'API';

export interface DocumentRevisionSummary {
  id: string;
  contentHash: string;
  source: RevisionSource;
  capturedAt: string;
}

export interface DocumentRevisionDetail extends DocumentRevisionSummary {
  rawContent: string;
}

/**
 * Read-only documental + structured views (FASE-06). Mirrors
 * apps/api/src/modules/roadmap's RoadmapController — no orchestration or
 * write-back here, that's FASE-08's synchronization module.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);

  getRaw(projectId: string, kind: DocumentKind): Promise<RawDocument> {
    return firstValueFrom(
      this.http.get<RawDocument>(`${API_BASE_URL}/projects/${projectId}/documents/${kind}/raw`),
    );
  }

  getStructuredRoadmap(projectId: string): Promise<ParsedRoadmapRow[]> {
    return firstValueFrom(
      this.http.get<ParsedRoadmapRow[]>(
        `${API_BASE_URL}/projects/${projectId}/documents/roadmap/structured`,
      ),
    );
  }

  getStructuredAgentslog(projectId: string): Promise<ParsedAgentslog> {
    return firstValueFrom(
      this.http.get<ParsedAgentslog>(
        `${API_BASE_URL}/projects/${projectId}/documents/agentslog/structured`,
      ),
    );
  }

  /** The status words the ledger uses, the ones PM Hub does not know first (Roadmap TASK-30). */
  getLedgerWords(projectId: string): Promise<LedgerWord[]> {
    return firstValueFrom(
      this.http.get<LedgerWord[]>(
        `${API_BASE_URL}/projects/${projectId}/documents/agentslog/words`,
      ),
    );
  }

  /** The IDs the ledger carries that are no task of the project, the open ones first (Roadmap TASK-33). */
  getUntrackedWork(projectId: string): Promise<UntrackedWork[]> {
    return firstValueFrom(
      this.http.get<UntrackedWork[]>(
        `${API_BASE_URL}/projects/${projectId}/documents/agentslog/untracked`,
      ),
    );
  }

  /** Turns the closed ledger work of these IDs into done tasks; open work and IDs that are no work are left (Roadmap TASK-34). */
  importUntracked(projectId: string, ids: string[]): Promise<UntrackedImportResult> {
    return firstValueFrom(
      this.http.post<UntrackedImportResult>(
        `${API_BASE_URL}/projects/${projectId}/documents/agentslog/untracked/import`,
        { ids },
      ),
    );
  }

  /** Revision history (brief §10), newest first; empty until the project has synced. */
  listRevisions(projectId: string, kind: DocumentKind): Promise<DocumentRevisionSummary[]> {
    return firstValueFrom(
      this.http.get<DocumentRevisionSummary[]>(
        `${API_BASE_URL}/projects/${projectId}/documents/${kind}/revisions`,
      ),
    );
  }

  getRevision(
    projectId: string,
    kind: DocumentKind,
    revisionId: string,
  ): Promise<DocumentRevisionDetail> {
    return firstValueFrom(
      this.http.get<DocumentRevisionDetail>(
        `${API_BASE_URL}/projects/${projectId}/documents/${kind}/revisions/${revisionId}`,
      ),
    );
  }
}
