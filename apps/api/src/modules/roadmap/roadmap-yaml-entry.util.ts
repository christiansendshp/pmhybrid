import {
  Document as YamlDocument,
  parse as parseYaml,
  parseDocument,
} from 'yaml';
import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import { detectLineEnding } from './line-ending.util.js';
import type { ParsedRoadmapRow } from './roadmap-parser.service.js';
import type { RoadmapOwner, RoadmapOwnerKind } from './roadmap-owner.util.js';

/**
 * `references/roadmap-schema.md` §1: a `###` heading immediately followed by
 * one blank line and one fenced `yaml` block. Accepts an em dash, en dash, or
 * plain hyphen as the heading separator — the spec's own examples use an em
 * dash, but nothing about the format depends on which one is typed.
 */
const HEADING_RE = /^### (\S+) [—–-] .+$/;

/**
 * CommonMark fence rule (what prettier actually emits): a fence is 3+
 * backticks, and its closing fence must be at least as long. Prettier
 * auto-escalates to 4+ backticks whenever an entry's own YAML content
 * (e.g. a `description` quoting this file's own format) contains a run of
 * 3 backticks, so a literal 3-backtick-only match silently drops that
 * entry instead of erroring — found via Roadmap GAP-28's own BUG-01 entry,
 * whose description does exactly this.
 */
const FENCE_OPEN_RE = /^(`{3,})yaml\s*$/;

function matchFenceOpen(line: string): { length: number } | null {
  const match = FENCE_OPEN_RE.exec(line.trim());
  return match ? { length: match[1].length } : null;
}

function isFenceClose(line: string, minLength: number): boolean {
  const match = /^(`{3,})\s*$/.exec(line.trim());
  return !!match && match[1].length >= minLength;
}

export interface RoadmapYamlEntry {
  id: string;
  type: string;
  /** 0-based line index of the `### TYPE-ID — Title` heading. */
  headingLine: number;
  /** 0-based line index of the opening fence (3+ backticks + `yaml`). */
  fenceOpenLine: number;
  /** 0-based line index of the closing fence (backticks only, >= the opening fence's length). */
  fenceCloseLine: number;
  data: Record<string, unknown>;
}

/**
 * Positive-signal detector: true when the document contains at least one
 * entry heading immediately followed by a `yaml` fence, OR (Roadmap
 * GAP-28's BUG-02) both structural section headings (`## Plan` and
 * `## Cross-cutting`) with zero entries under either — the shape
 * `templates/Roadmap.md` scaffolds and a fully-drained new-format file
 * degrades to. Never inferred from the *absence* of old-format tables —
 * `extractMarkdownTables` ignores heading text entirely, so a new-format
 * file fed to the old table parser silently yields zero tables rather than
 * erroring, which would otherwise look identical to an empty old-format
 * document. Requiring *both* section headings (rather than either alone)
 * matches the one shape the schema actually guarantees; confirmed by
 * search that no old-format table, fixture, or other in-repo document
 * parsed by this function contains a literal `## Cross-cutting` or
 * `## Plan` line.
 */
export function looksLikeNewFormatRoadmap(markdown: string): boolean {
  const lines = markdown.split(/\r?\n/);
  let hasPlanHeading = false;
  let hasCrossCuttingHeading = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '## Plan') {
      hasPlanHeading = true;
      continue;
    }
    if (trimmed === '## Cross-cutting') {
      hasCrossCuttingHeading = true;
      continue;
    }
    if (!HEADING_RE.test(trimmed)) {
      continue;
    }
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') {
      j += 1;
    }
    if (j < lines.length && matchFenceOpen(lines[j])) {
      return true;
    }
  }
  return hasPlanHeading && hasCrossCuttingHeading;
}

/**
 * The document is malformed as a whole (as opposed to one entry being
 * unreadable): sync reports it as a fixable document problem, not a crash.
 */
export class RoadmapFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoadmapFormatError';
  }
}

/**
 * One entry that could not be read (Roadmap BUG-05). `id` is the heading's
 * id — the YAML itself is what failed, so it cannot be trusted to say.
 */
export interface RoadmapEntryError {
  id: string;
  /** 1-based line in the file of the offending YAML line (or the heading when unknown). */
  line: number;
  /** One readable line: what is wrong, without a code frame. */
  reason: string;
  /** The full original message, as `extractRoadmapYamlEntries` throws it. */
  message: string;
}

/**
 * `yaml`'s message is a code frame; the first line is the readable part. Its
 * "at line N, column M" is relative to the block, not the file (the entry's
 * own `line` says where), so it is dropped rather than left to mislead.
 */
function readableYamlReason(message: string): string {
  const reason = message
    .split('\n')[0]
    .replace(/\s+at line \d+, column \d+:?$/, '')
    .trim();
  // The most common authoring mistake: an unquoted value containing ": "
  // (e.g. `title: Foo: bar`) reads as a nested mapping.
  return reason.startsWith('Nested mappings')
    ? `${reason} — quote a value that contains ": "`
    : reason;
}

/**
 * Parses every `### TYPE-ID — Title` + yaml-fenced entry, isolating a
 * failure to the entry it belongs to (Roadmap BUG-05): an invalid YAML
 * block, one that is not a mapping, or one missing `id`/`type`/`status` is
 * reported in `errors` and the rest are still returned. Only an unterminated
 * fence still throws — nothing after it can be trusted to belong where it
 * looks like it does.
 *
 * A caller must never treat an entry in `errors` as *absent*: reconciling
 * without it would sweep its task as a disappeared row. It is present but
 * unreadable, and its heading id is what identifies it.
 */
export function extractRoadmapYamlEntriesTolerant(markdown: string): {
  entries: RoadmapYamlEntry[];
  errors: RoadmapEntryError[];
} {
  const lines = markdown.split(/\r?\n/);
  const entries: RoadmapYamlEntry[] = [];
  const errors: RoadmapEntryError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const heading = HEADING_RE.exec(lines[i].trim());
    if (!heading) {
      continue;
    }

    let fenceOpenLine = i + 1;
    while (fenceOpenLine < lines.length && lines[fenceOpenLine].trim() === '') {
      fenceOpenLine += 1;
    }
    const fenceOpen =
      fenceOpenLine < lines.length
        ? matchFenceOpen(lines[fenceOpenLine])
        : null;
    if (!fenceOpen) {
      continue; // not an entry heading (e.g. a section title) — keep scanning
    }

    let fenceCloseLine = fenceOpenLine + 1;
    while (
      fenceCloseLine < lines.length &&
      !isFenceClose(lines[fenceCloseLine], fenceOpen.length)
    ) {
      fenceCloseLine += 1;
    }
    if (fenceCloseLine >= lines.length) {
      throw new RoadmapFormatError(
        `Roadmap.md: unterminated \`\`\`yaml block for entry "${heading[1]}" starting at line ${fenceOpenLine + 1}`,
      );
    }

    const entryId = heading[1];
    const fail = (line: number, reason: string, message: string) => {
      errors.push({ id: entryId, line, reason, message });
      i = fenceCloseLine;
    };

    const yamlText = lines.slice(fenceOpenLine + 1, fenceCloseLine).join('\n');
    let parsed: unknown;
    try {
      parsed = parseYaml(yamlText);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const linePos = (error as { linePos?: { line: number }[] }).linePos;
      const yamlLine = linePos?.[0]?.line ?? 1;
      fail(
        fenceOpenLine + yamlLine + 1,
        readableYamlReason(raw),
        `Roadmap.md: invalid YAML in entry "${entryId}" (line ${fenceOpenLine + 2}): ${raw}`,
      );
      continue;
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      fail(
        fenceOpenLine + 2,
        'the yaml block must be a mapping',
        `Roadmap.md: entry "${entryId}"'s yaml block must be a mapping`,
      );
      continue;
    }
    const data = parsed as Record<string, unknown>;
    const missing = (['id', 'type', 'status'] as const).find(
      (required) => typeof data[required] !== 'string' || !data[required],
    );
    if (missing) {
      fail(
        fenceOpenLine + 2,
        `missing a required "${missing}" field (it must be a non-empty string)`,
        `Roadmap.md: entry "${entryId}" is missing a required "${missing}" field`,
      );
      continue;
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

  // The same id twice is ambiguous — which copy is the task? — so neither is
  // imported: every copy is reported, naming the others, and the task is
  // protected like any other unreadable entry (Roadmap GAP-35b).
  const byId = new Map<string, RoadmapYamlEntry[]>();
  for (const entry of entries) {
    byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry]);
  }
  const duplicated = [...byId.values()].filter((group) => group.length > 1);
  if (duplicated.length === 0) {
    return { entries, errors };
  }
  const dropped = new Set(duplicated.flat());
  for (const group of duplicated) {
    const lines = group.map((entry) => entry.headingLine + 1);
    for (const entry of group) {
      const line = entry.headingLine + 1;
      errors.push({
        id: entry.id,
        line,
        reason: `duplicate id, also defined at line ${lines.filter((other) => other !== line).join(', ')}`,
        message: `Roadmap.md: entry "${entry.id}" is defined more than once (lines ${lines.join(', ')})`,
      });
    }
  }
  errors.sort((a, b) => a.line - b.line);
  return {
    entries: entries.filter((entry) => !dropped.has(entry)),
    errors,
  };
}

/**
 * Strict form: throws on the first entry that cannot be read (never returns
 * a silently-shortened list). For everything that writes the document back —
 * a write-back built on a partial read would drop the entry it could not
 * see — and for callers that want all-or-nothing.
 */
export function extractRoadmapYamlEntries(
  markdown: string,
): RoadmapYamlEntry[] {
  const { entries, errors } = extractRoadmapYamlEntriesTolerant(markdown);
  if (errors.length > 0) {
    throw new RoadmapFormatError(errors[0].message);
  }
  return entries;
}

/**
 * The entries a write-back may work against: every readable one, unless the
 * entry being written is itself among the unreadable ones. A broken sibling
 * changes nothing about where this entry's lines are, so it must not block
 * the edit; but if the target is the broken one, "no entry with this id"
 * would make an upsert append a duplicate — refuse instead.
 */
export function extractRoadmapYamlEntriesForWrite(
  markdown: string,
  targetId: string,
): RoadmapYamlEntry[] {
  const { entries, errors } = extractRoadmapYamlEntriesTolerant(markdown);
  const blocking = errors.find((error) => error.id === targetId);
  if (blocking) {
    throw new RoadmapFormatError(blocking.message);
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

/**
 * The document's own status vocabulary (references/roadmap-schema.md §6). A
 * token outside it is a mistake in the document (a typo, a private state),
 * unlike IDEA/REVIEW/CANCELLED/DEFERRED/PENDING/DECIDED, which are valid states that simply
 * have no Kanban column — those stay unmapped and raise nothing.
 */
const NEW_FORMAT_STATUSES: ReadonlySet<string> = new Set([
  'IDEA',
  'BACKLOG',
  'READY',
  'IN_PROGRESS',
  'REVIEW',
  'TESTING',
  'BLOCKED',
  'DONE',
  'CANCELLED',
  'DEFERRED',
  // A DECISION entry's own states (references/roadmap-schema.md §6); CANCELLED is shared.
  'PENDING',
  'DECIDED',
]);

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

/** `owner.type` says whether the named owner is a person or an agent; anything else leaves it open. */
function ownerKindOf(owner: unknown): RoadmapOwnerKind | undefined {
  const type = (owner as { type?: unknown }).type;
  const normalized = typeof type === 'string' ? type.trim().toUpperCase() : '';
  if (normalized === 'HUMAN') {
    return 'HUMAN';
  }
  return normalized === 'AI' || normalized === 'AI_AGENT'
    ? 'AI_AGENT'
    : undefined;
}

/**
 * Writes an assignee into an entry, as exactly one form (Roadmap GAP-35a),
 * following the schema's split (references/roadmap-schema.md): an agent is
 * `executor: AI` + `assigned_agent` and never touches `owner` (who is
 * accountable); a person becomes `owner` — the only field that can name one
 * — and the agent form is removed, since a stale `assigned_agent` would win
 * on the next read and hand the task back to the agent.
 */
export function applyOwnerToEntry(
  doc: YamlDocument,
  owner: RoadmapOwner,
): void {
  if (owner.kind === 'AI_AGENT') {
    doc.set('executor', 'AI');
    doc.set('assigned_agent', owner.name);
    return;
  }
  doc.set('executor', 'HUMAN');
  doc.delete('assigned_agent');
  doc.set('owner', { type: 'HUMAN', name: owner.name });
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
  ownerKind?: RoadmapOwnerKind;
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
      ownerKind: 'AI_AGENT',
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
    return { rawOwner: ownerName, ownerName, ownerKind: ownerKindOf(owner) };
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
      // A blocked entry still has its title (Roadmap GAP-35b); only the old
      // format's Blocked table lacks the column.
      outcome: typeof data.title === 'string' ? data.title : undefined,
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
    if (!NEW_FORMAT_STATUSES.has(statusRaw.trim().toUpperCase())) {
      row.statusUnrecognized = true;
    }
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
  const eol = detectLineEnding(markdown);
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
  return lines.join(eol);
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
  const eol = detectLineEnding(markdown);
  const sectionIndex = lines.findIndex(
    (line) => line.trim() === '## Cross-cutting',
  );
  if (sectionIndex === -1) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push('## Cross-cutting', '', ...block);
    return lines.join(eol);
  }

  let insertAt = sectionIndex + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === '') {
    insertAt += 1;
  }
  lines.splice(insertAt, 0, ...block);
  return lines.join(eol);
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
  const entries = extractRoadmapYamlEntriesForWrite(markdown, id);
  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    return null;
  }
  const lines = markdown.split(/\r?\n/);
  const eol = detectLineEnding(markdown);
  let end = entry.fenceCloseLine + 1;
  if (end < lines.length && lines[end].trim() === '') {
    end += 1;
  }
  lines.splice(entry.headingLine, end - entry.headingLine);
  return lines.join(eol);
}
