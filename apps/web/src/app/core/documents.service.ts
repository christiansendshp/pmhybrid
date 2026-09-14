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
}
