import { Injectable } from '@nestjs/common';
import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import {
  discriminateRoadmapTable,
  extractMarkdownTables,
} from './markdown-table.util.js';
import {
  extractRoadmapYamlEntries,
  looksLikeNewFormatRoadmap,
  roadmapYamlEntryToRow,
} from './roadmap-yaml-entry.util.js';

export interface ParsedRoadmapRow {
  externalId: string;
  table: RoadmapTable;
  outcome?: string;
  acceptanceCheck?: string;
  statusRaw?: string;
  /** null = present but not a recognized token — docs/roadmap-parser.md: never default to PENDIENTE. */
  statusMapped?: TaskStatus | null;
  rawOwner?: string;
  ownerName?: string;
  ownerClaimedAt?: string;
  dependsOnRaw?: string;
  blocker?: string;
  neededDecision?: string;
}

// Bidirectional + closed (docs/roadmap-parser.md "Status token mapping") — identity
// entries let a previously-written verbatim Kanban state round-trip unchanged.
const STATUS_MAP: Record<string, TaskStatus> = {
  TODO: TaskStatus.PENDIENTE,
  'IN PROGRESS': TaskStatus.EN_DESARROLLO,
  DONE: TaskStatus.TERMINADA,
  PENDIENTE: TaskStatus.PENDIENTE,
  ASIGNADA: TaskStatus.ASIGNADA,
  'EN DESARROLLO': TaskStatus.EN_DESARROLLO,
  QA: TaskStatus.QA,
  TERMINADA: TaskStatus.TERMINADA,
};

function normalizeStatusToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
}

function mapStatus(raw: string): TaskStatus | null {
  return STATUS_MAP[normalizeStatusToken(raw)] ?? null;
}

/** Split on the LAST '@' (docs/roadmap-parser.md "Owner cell parsing"). */
function parseOwnerCell(raw: string): {
  ownerName?: string;
  ownerClaimedAt?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') {
    return {};
  }
  const at = trimmed.lastIndexOf('@');
  if (at === -1) {
    return { ownerName: trimmed };
  }
  const name = trimmed.slice(0, at).trim();
  const timestamp = trimmed.slice(at + 1).trim();
  const parsed = new Date(timestamp);
  return {
    ownerName: name || undefined,
    ownerClaimedAt: Number.isNaN(parsed.getTime())
      ? undefined
      : parsed.toISOString(),
  };
}

function isPlaceholder(value: string): boolean {
  return !value || value === '—' || value === '-';
}

/**
 * Parses Roadmap.md, either the old three-table format (Active work / Near
 * term / Blocked, discriminated by column signature rather than heading
 * text — docs/roadmap-parser.md) or the new per-entry YAML format
 * (project-documentation skill v2, references/roadmap-schema.md), detected
 * by a positive signal (an entry heading immediately followed by a `yaml`
 * fence) rather than by "the old parser found nothing" — a new-format file
 * fed to the old table extractor silently yields zero tables, which must
 * not be mistaken for a genuinely empty old-format document (that would
 * make every task in the project look removed to the reconciliation sweep).
 * Read-only — no orchestration, no persistence; that's synchronization.module
 * (FASE-08).
 */
@Injectable()
export class RoadmapParserService {
  parse(rawMarkdown: string): ParsedRoadmapRow[] {
    if (looksLikeNewFormatRoadmap(rawMarkdown)) {
      return extractRoadmapYamlEntries(rawMarkdown).map(roadmapYamlEntryToRow);
    }

    const tables = extractMarkdownTables(rawMarkdown);
    const results: ParsedRoadmapRow[] = [];

    for (const table of tables) {
      const kind = discriminateRoadmapTable(table.headers);
      if (!kind) {
        continue;
      }

      const idIndex = table.headers.indexOf('ID');
      if (idIndex === -1) {
        continue;
      }

      for (const cells of table.rows) {
        const externalId = cells[idIndex];
        if (isPlaceholder(externalId)) {
          continue;
        }

        const get = (column: string): string | undefined => {
          const index = table.headers.indexOf(column);
          if (index === -1) {
            return undefined;
          }
          const value = cells[index];
          return isPlaceholder(value) ? undefined : value;
        };

        const row: ParsedRoadmapRow = { externalId, table: kind };

        if (kind === RoadmapTable.BLOCKED) {
          row.blocker = get('Blocker');
          row.neededDecision = get('Needed decision or event');
          const ownerCell = get('Owner');
          if (ownerCell) {
            row.rawOwner = ownerCell;
            Object.assign(row, parseOwnerCell(ownerCell));
          }
        } else {
          row.outcome = get('Outcome');
          row.acceptanceCheck = get('Acceptance check');
          const statusCell = get('Status');
          if (statusCell) {
            row.statusRaw = statusCell;
            row.statusMapped = mapStatus(statusCell);
          }
          row.dependsOnRaw = get('Depends on');
          const ownerCell = get('Owner');
          if (ownerCell) {
            row.rawOwner = ownerCell;
            Object.assign(row, parseOwnerCell(ownerCell));
          }
        }

        results.push(row);
      }
    }

    return results;
  }
}
