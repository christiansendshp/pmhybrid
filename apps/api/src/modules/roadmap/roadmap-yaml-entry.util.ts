import {
  Document as YamlDocument,
  parse as parseYaml,
  parseDocument,
} from 'yaml';
import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import type { ParsedRoadmapRow } from './roadmap-parser.service.js';

/**
 * `references/roadmap-schema.md` §1: a `###` heading immediately followed by
 * one blank line and one fenced `yaml` block. Accepts an em dash, en dash, or
 * plain hyphen as the heading separator — the spec's own examples use an em
 * dash, but nothing about the format depends on which one is typed.
 */
const HEADING_RE = /^### (\S+) [—–-] .+$/;

export interface RoadmapYamlEntry {
  id: string;
  type: string;
  /** 0-based line index of the `### TYPE-ID — Title` heading. */
  headingLine: number;
  /** 0-based line index of the opening ` ```yaml ` fence. */
  fenceOpenLine: number;
  /** 0-based line index of the closing ` ``` ` fence. */
  fenceCloseLine: number;
  data: Record<string, unknown>;
}

/**
 * Positive-signal detector: true only when the document contains at least
 * one entry heading immediately followed by a `yaml` fence. Never inferred
 * from the *absence* of old-format tables — `extractMarkdownTables` ignores
 * heading text entirely, so a new-format file fed to the old table parser
 * silently yields zero tables rather than erroring, which would otherwise
 * look identical to an empty old-format document.
 */
export function looksLikeNewFormatRoadmap(markdown: string): boolean {
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!HEADING_RE.test(lines[i].trim())) {
      continue;
    }
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') {
      j += 1;
    }
    if (j < lines.length && lines[j].trim() === '```yaml') {
      return true;
    }
  }
  return false;
}

/**
 * Parses every `### TYPE-ID — Title` + ```` ```yaml ```` entry in the
 * document. Throws (never returns a silently-empty list for content that
 * looks like an attempted entry) on an unterminated fence, invalid YAML, or
 * a missing required field — a caller that swallowed this into `[]` would
 * feed `reconcileRoadmap` an empty row set, which mass-completes or
 * mass-conflicts every task in the project via its disappeared-row sweep.
 */
export function extractRoadmapYamlEntries(
  markdown: string,
): RoadmapYamlEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: RoadmapYamlEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const heading = HEADING_RE.exec(lines[i].trim());
    if (!heading) {
      continue;
    }

    let fenceOpenLine = i + 1;
    while (fenceOpenLine < lines.length && lines[fenceOpenLine].trim() === '') {
      fenceOpenLine += 1;
    }
    if (
      fenceOpenLine >= lines.length ||
      lines[fenceOpenLine].trim() !== '```yaml'
    ) {
      continue; // not an entry heading (e.g. a section title) — keep scanning
    }

    let fenceCloseLine = fenceOpenLine + 1;
    while (
      fenceCloseLine < lines.length &&
      lines[fenceCloseLine].trim() !== '```'
    ) {
      fenceCloseLine += 1;
    }
    if (fenceCloseLine >= lines.length) {
      throw new Error(
        `Roadmap.md: unterminated \`\`\`yaml block for entry "${heading[1]}" starting at line ${fenceOpenLine + 1}`,
      );
    }

    const yamlText = lines.slice(fenceOpenLine + 1, fenceCloseLine).join('\n');
    let parsed: unknown;
    try {
      parsed = parseYaml(yamlText);
    } catch (error) {
      throw new Error(
        `Roadmap.md: invalid YAML in entry "${heading[1]}" (line ${fenceOpenLine + 2}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        `Roadmap.md: entry "${heading[1]}"'s yaml block must be a mapping`,
      );
    }
    const data = parsed as Record<string, unknown>;
    for (const required of ['id', 'type', 'status'] as const) {
      if (typeof data[required] !== 'string' || !data[required]) {
        throw new Error(
          `Roadmap.md: entry "${heading[1]}" is missing a required "${required}" field`,
        );
      }
    }

    entries.push({
      id: data.id as string,
      type: data.type as string,
      headingLine: i,
      fenceOpenLine,
      fenceCloseLine,
      data,
    });
    i = fenceCloseLine;
  }

  return entries;
}

// Base vocabulary (references/roadmap-schema.md §6) <-> TaskStatus. Boundary
// translation, not verbatim (supersedes ADR-002 for the new format only —
// see docs/decisions for the record). Only the five states with a real
// Kanban equivalent map; IDEA/REVIEW/CANCELLED/DEFERRED have none and are
// left unmapped (statusMapped: null) rather than guessed. BLOCKED doesn't
// map here either — it's carried via RoadmapTable.BLOCKED, mirroring how the
// old format's Blocked table never had a Status column at all.
const NEW_STATUS_TO_TASK_STATUS: Record<string, TaskStatus> = {
  BACKLOG: TaskStatus.PENDIENTE,
  READY: TaskStatus.ASIGNADA,
  IN_PROGRESS: TaskStatus.EN_DESARROLLO,
  TESTING: TaskStatus.QA,
  DONE: TaskStatus.TERMINADA,
};

const TASK_STATUS_TO_NEW_STATUS: Record<TaskStatus, string> = {
  [TaskStatus.PENDIENTE]: 'BACKLOG',
  [TaskStatus.ASIGNADA]: 'READY',
  [TaskStatus.EN_DESARROLLO]: 'IN_PROGRESS',
  [TaskStatus.QA]: 'TESTING',
  [TaskStatus.TERMINADA]: 'DONE',
};

export function mapNewStatusToTaskStatus(raw: string): TaskStatus | null {
  return NEW_STATUS_TO_TASK_STATUS[raw.trim().toUpperCase()] ?? null;
}

export function mapTaskStatusToNewStatus(status: TaskStatus): string {
  const mapped = TASK_STATUS_TO_NEW_STATUS[status];
  if (!mapped) {
    // Should be unreachable — TaskStatus is a closed Prisma enum and every
    // member has an entry above. Throwing here (rather than writing
    // `status: undefined` into the document) turns a future enum addition
    // that forgets this map into a loud failure instead of a malformed
    // Roadmap.md entry that the parser then throws on anyway, later and
    // less informatively.
    throw new Error(`No new-format status mapping for TaskStatus "${status}"`);
  }
  return mapped;
}

function flattenIdList(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const ids = value.filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    return ids.length > 0 ? ids.join(', ') : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function flattenAcceptanceCriteria(
  data: Record<string, unknown>,
): string | undefined {
  const list = data.acceptance_criteria;
  if (!Array.isArray(list) || list.length === 0) {
    return undefined;
  }
  const parts = list.map((item) => {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const id = typeof obj.id === 'string' ? obj.id : undefined;
      const description =
        typeof obj.description === 'string' ? obj.description : '';
      return id ? `[${id}] ${description}` : description;
    }
    return String(item);
  });
  return parts.join('; ');
}

/**
 * `owner`/`executor`/`assigned_agent` (schema §11) collapse into the same
 * single owner cell the old format used (`Name@timestamp` for an AI agent,
 * plain name for a human) — the round-trip is lossy in that direction
 * (write-back doesn't yet know which HUMAN sub-fields to preserve beyond
 * name), documented rather than silently assumed perfect.
 */
function deriveOwnerFields(data: Record<string, unknown>): {
  rawOwner?: string;
  ownerName?: string;
  ownerClaimedAt?: string;
} {
  const executor =
    typeof data.executor === 'string' ? data.executor : undefined;
  const assignedAgent =
    typeof data.assigned_agent === 'string' ? data.assigned_agent : undefined;
  const updatedAt =
    typeof data.updated_at === 'string' ? data.updated_at : undefined;

  if (executor === 'AI' && assignedAgent) {
    const parsedDate = updatedAt ? new Date(updatedAt) : undefined;
    const validTimestamp =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : undefined;
    return {
      rawOwner: validTimestamp
        ? `${assignedAgent}@${validTimestamp}`
        : assignedAgent,
      ownerName: assignedAgent,
      ownerClaimedAt: validTimestamp,
    };
  }

  const owner = data.owner;
  const ownerName =
    owner &&
    typeof owner === 'object' &&
    typeof (owner as { name?: unknown }).name === 'string'
      ? (owner as { name: string }).name
      : undefined;
  if (ownerName) {
    return { rawOwner: ownerName, ownerName };
  }
  return {};
}

/**
 * Maps one parsed new-format entry to the same `ParsedRoadmapRow` shape the
 * old table parser produces, so `reconcileRoadmap`/`rowContentHash`/write-back
 * need no changes to consume either format. Every entry type becomes a row,
 * mirroring current behavior where a GAP-xx row and a TASK-xx row both
 * already become Task records side by side — a type-aware filter (e.g.
 * excluding VISION/PHASE/DECISION from the Kanban) is a real product
 * decision, deliberately not made here.
 */
export function roadmapYamlEntryToRow(
  entry: RoadmapYamlEntry,
): ParsedRoadmapRow {
  const data = entry.data;
  const statusRaw = typeof data.status === 'string' ? data.status : undefined;
  const isBlocked = statusRaw?.trim().toUpperCase() === 'BLOCKED';
  const owner = deriveOwnerFields(data);

  if (isBlocked) {
    return {
      externalId: entry.id,
      table: RoadmapTable.BLOCKED,
      blocker: flattenIdList(data.blocked_by),
      ...owner,
    };
  }

  const row: ParsedRoadmapRow = {
    externalId: entry.id,
    // The new schema has no ACTIVE-vs-NEAR_TERM distinction (that split was
    // cosmetic — NEAR_TERM's only difference was lacking an Owner column),
    // so every non-blocked entry defaults to ACTIVE here. Consequence to
    // expect, not a bug: the first sync of a converted Roadmap.md moves
    // every existing NEAR_TERM task (e.g. GAP-22..26 today) to ACTIVE,
    // each recorded as an ordinary ROADMAP_TABLE_CHANGE audit event — no
    // data loss, just a one-time table-membership migration.
    table: RoadmapTable.ACTIVE,
    outcome: typeof data.title === 'string' ? data.title : undefined,
    acceptanceCheck: flattenAcceptanceCriteria(data),
    dependsOnRaw: flattenIdList(data.depends_on),
    ...owner,
  };
  if (statusRaw) {
    row.statusRaw = statusRaw;
    row.statusMapped = mapNewStatusToTaskStatus(statusRaw);
  }
  return row;
}

function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  );
}

/**
 * Re-serializes one entry's YAML block after `mutate` edits its parsed
 * document in place, preserving every other line of the file (other
 * entries, headings, prose) byte-for-byte — the same "surgically edit one
 * row" discipline `roadmap-row-writer.util.ts` uses for the old format's
 * `findRoadmapTableLineRange`.
 */
export function replaceEntryYamlBlock(
  markdown: string,
  entry: RoadmapYamlEntry,
  mutate: (doc: YamlDocument) => void,
): string {
  const lines = markdown.split(/\r?\n/);
  const yamlText = lines
    .slice(entry.fenceOpenLine + 1, entry.fenceCloseLine)
    .join('\n');
  const doc = parseDocument(yamlText);
  mutate(doc);
  const rendered = doc.toString({ lineWidth: 0 }).replace(/\n$/, '');
  const newLines = rendered.split('\n');
  lines.splice(
    entry.fenceOpenLine + 1,
    entry.fenceCloseLine - entry.fenceOpenLine - 1,
    ...newLines,
  );
  return lines.join('\n');
}

/**
 * Appends a brand-new entry to `## Cross-cutting` (creating the section if
 * the file somehow lacks one) — the new-format analogue of the old writer's
 * "no table holds this row yet, insert into Active work" fallback.
 */
export function appendRoadmapYamlEntry(
  markdown: string,
  data: Record<string, unknown>,
): string {
  const clean = stripUndefined(data);
  const doc = new YamlDocument();
  doc.contents = doc.createNode(clean);
  const yamlText = doc.toString({ lineWidth: 0 }).replace(/\n$/, '');
  const heading = `### ${clean.id} — ${clean.title ?? clean.id}`;
  const block = [heading, '', '```yaml', ...yamlText.split('\n'), '```', ''];

  const lines = markdown.split(/\r?\n/);
  const sectionIndex = lines.findIndex(
    (line) => line.trim() === '## Cross-cutting',
  );
  if (sectionIndex === -1) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push('## Cross-cutting', '', ...block);
    return lines.join('\n');
  }

  let insertAt = sectionIndex + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === '') {
    insertAt += 1;
  }
  lines.splice(insertAt, 0, ...block);
  return lines.join('\n');
}

/**
 * Removes a whole entry (heading + fenced block, plus one trailing blank
 * line) — the new-format analogue of `removeRoadmapRow`. Returns null when
 * no entry with this id exists, same contract as the old-format function.
 */
export function removeRoadmapYamlEntry(
  markdown: string,
  id: string,
): string | null {
  const entries = extractRoadmapYamlEntries(markdown);
  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    return null;
  }
  const lines = markdown.split(/\r?\n/);
  let end = entry.fenceCloseLine + 1;
  if (end < lines.length && lines[end].trim() === '') {
    end += 1;
  }
  lines.splice(entry.headingLine, end - entry.headingLine);
  return lines.join('\n');
}
