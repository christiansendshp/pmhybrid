import { Injectable } from '@nestjs/common';
import { RoadmapTable, TaskPriority, TaskStatus } from '@pmhybrid/shared-types';
import {
  discriminateRoadmapTable,
  extractMarkdownTables,
} from './markdown-table.util.js';
import type { RoadmapOwnerKind } from './roadmap-owner.util.js';
import {
  extractRoadmapYamlEntriesTolerant,
  looksLikeNewFormatRoadmap,
  roadmapYamlEntryToRow,
  RoadmapFormatError,
  type RoadmapEntryError,
} from './roadmap-yaml-entry.util.js';

export interface ParsedRoadmapRow {
  externalId: string;
  table: RoadmapTable;
  outcome?: string;
  acceptanceCheck?: string;
  statusRaw?: string;
  /** null = present but not a recognized token — docs/roadmap-parser.md: never default to PENDIENTE. */
  statusMapped?: TaskStatus | null;
  /** The status token is in none of the document's vocabularies — a mistake to report, as opposed to a valid state with no Kanban equivalent (Roadmap GAP-35b). */
  statusUnrecognized?: boolean;
  rawOwner?: string;
  ownerName?: string;
  /** Person or agent, when the document says (`executor: AI`, `owner.type`); absent in the old tables. */
  ownerKind?: RoadmapOwnerKind;
  ownerClaimedAt?: string;
  dependsOnRaw?: string;
  /** True when the row's table has a Depends on column, so an empty cell means "none" rather than "not carried". Absent means: true unless the row is in a Blocked table. */
  carriesDependsOn?: boolean;
  /** The Pause reason cell of a PAUSE row (project-documentation skill: "CATEGORY - detail"). */
  pauseReason?: string;
  blocker?: string;
  neededDecision?: string;
  /** The entry's `type`, upper-cased (YAML entries only; a table row has none) — Roadmap GAP-35c. */
  entryType?: string;
  /** The entry's `priority` as the app's level, when it says one it knows (YAML entries only). */
  priority?: TaskPriority;
  /** The entry's `progress`, a whole percent (YAML entries only). */
  progress?: number;
}

/** Whether an empty `dependsOnRaw` on this row says "no dependencies" (true) or says nothing (false). */
export function rowCarriesDependsOn(row: ParsedRoadmapRow): boolean {
  return row.carriesDependsOn ?? row.table !== RoadmapTable.BLOCKED;
}

/** What a tolerant read yields: every entry that could be read, and — separately — the ones that could not (Roadmap BUG-05). */
export interface ParsedRoadmap {
  rows: ParsedRoadmapRow[];
  errors: RoadmapEntryError[];
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

/**
 * Valid workflow states with no Kanban column: PAUSE (project-documentation
 * skill) is work that was started and stopped, which none of the five columns
 * says. The task keeps the column it has, and no conflict is raised — the
 * same treatment the YAML format gives IDEA/REVIEW/CANCELLED/DEFERRED.
 */
const STATES_WITHOUT_COLUMN: ReadonlySet<string> = new Set(['PAUSE']);

/**
 * The skill's pause categories that mean somebody else has to act before the
 * work can go on (references/workflow.md): a blocker, or an answer awaited.
 * LIMITE (usage limit) and OTRO are only a stop, so they are not "blocked".
 */
const BLOCKING_PAUSE_CATEGORIES: ReadonlySet<string> = new Set([
  'BLOQUEO',
  'ESPERA_RESPUESTA',
]);

function normalizeStatusToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
}

/** The category of a skill Pause reason ("CATEGORY - detail"), upper-cased. */
export function pauseCategory(reason: string): string {
  const dash = reason.indexOf(' - ');
  return (dash === -1 ? reason : reason.slice(0, dash)).trim().toUpperCase();
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
  /**
   * Strict: throws if any entry cannot be read, rather than returning a
   * silently-shortened list. For callers that act on the absence of a row.
   */
  parse(rawMarkdown: string): ParsedRoadmapRow[] {
    const { rows, errors } = this.parseTolerant(rawMarkdown);
    if (errors.length > 0) {
      throw new RoadmapFormatError(errors[0].message);
    }
    return rows;
  }

  /**
   * Isolates an unreadable entry to itself (Roadmap BUG-05): the readable
   * rows are returned, the rest are listed in `errors`. Those entries are
   * present-but-unreadable, never absent — a caller reconciling against
   * `rows` alone must not read their absence as a removal. Only a document
   * that is malformed as a whole (an unterminated fence) still throws.
   */
  parseTolerant(rawMarkdown: string): ParsedRoadmap {
    if (looksLikeNewFormatRoadmap(rawMarkdown)) {
      const { entries, errors } =
        extractRoadmapYamlEntriesTolerant(rawMarkdown);
      return { rows: entries.map(roadmapYamlEntryToRow), errors };
    }
    return this.parseTables(rawMarkdown);
  }

  private parseTables(rawMarkdown: string): ParsedRoadmap {
    const tables = extractMarkdownTables(rawMarkdown);
    const results: { row: ParsedRoadmapRow; line: number }[] = [];

    for (const table of tables) {
      const kind = discriminateRoadmapTable(table.headers);
      if (!kind) {
        continue;
      }

      const idIndex = table.headers.indexOf('ID');
      if (idIndex === -1) {
        continue;
      }

      for (const [rowIndex, cells] of table.rows.entries()) {
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
          // The skill's Gaps table names the row's text `Description`.
          row.outcome = get('Outcome') ?? get('Description');
          row.acceptanceCheck = get('Acceptance check');
          const statusCell = get('Status');
          if (statusCell) {
            row.statusRaw = statusCell;
            row.statusMapped = mapStatus(statusCell);
            if (
              row.statusMapped === null &&
              !STATES_WITHOUT_COLUMN.has(normalizeStatusToken(statusCell))
            ) {
              row.statusUnrecognized = true;
            }
          }
          row.dependsOnRaw = get('Depends on');
          this.readPause(row, statusCell, get('Pause reason'));
          const ownerCell = get('Owner');
          if (ownerCell) {
            row.rawOwner = ownerCell;
            Object.assign(row, parseOwnerCell(ownerCell));
          }
        }

        results.push({ row, line: table.rowLines[rowIndex] });
      }
    }

    return this.withoutDuplicates(results);
  }

  /**
   * A PAUSE row's reason is only meaningful while it is paused (the skill
   * clears it on claim). A blocking one turns the row into a blocked one — the
   * skill has no Blocked table, it writes PAUSE with a BLOQUEO reason — while
   * its Depends on cell stays a real column.
   */
  private readPause(
    row: ParsedRoadmapRow,
    statusCell: string | undefined,
    reason: string | undefined,
  ): void {
    if (
      !reason ||
      !statusCell ||
      normalizeStatusToken(statusCell) !== 'PAUSE'
    ) {
      return;
    }
    row.pauseReason = reason;
    if (BLOCKING_PAUSE_CATEGORIES.has(pauseCategory(reason))) {
      row.table = RoadmapTable.BLOCKED;
      row.blocker = reason;
      row.carriesDependsOn = true;
    }
  }

  /**
   * The same id in two rows (in one table or across tables) is ambiguous, so
   * neither is imported: each is reported, naming the others, and the task is
   * protected like any unreadable entry (Roadmap GAP-35b).
   */
  private withoutDuplicates(
    results: { row: ParsedRoadmapRow; line: number }[],
  ): ParsedRoadmap {
    const linesById = new Map<string, number[]>();
    for (const { row, line } of results) {
      linesById.set(row.externalId, [
        ...(linesById.get(row.externalId) ?? []),
        line,
      ]);
    }
    const errors: RoadmapEntryError[] = [];
    for (const [id, lines] of linesById) {
      if (lines.length < 2) {
        continue;
      }
      for (const line of lines) {
        errors.push({
          id,
          line,
          reason: `duplicate id, also defined at line ${lines.filter((other) => other !== line).join(', ')}`,
          message: `Roadmap.md: row "${id}" is defined more than once (lines ${lines.join(', ')})`,
        });
      }
    }
    errors.sort((a, b) => a.line - b.line);
    return {
      rows: results
        .filter(({ row }) => (linesById.get(row.externalId)?.length ?? 0) < 2)
        .map(({ row }) => row),
      errors,
    };
  }
}
