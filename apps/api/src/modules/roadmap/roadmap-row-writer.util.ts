import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import {
  findAllRoadmapTableRanges,
  findRoadmapTableLineRange,
  isSkillRoadmap,
  splitRow,
} from './markdown-table.util.js';
import { isPauseCell, workflowStatusFor } from './status-vocabulary.util.js';
import { detectLineEnding } from './line-ending.util.js';
import { ownerCell, type RoadmapOwner } from './roadmap-owner.util.js';
import {
  priorityFromDocument,
  priorityToDocument,
  progressFromDocument,
} from './roadmap-attributes.util.js';
import {
  appendRoadmapYamlEntry,
  applyOwnerToEntry,
  extractRoadmapYamlEntriesForWrite,
  looksLikeNewFormatRoadmap,
  mapTaskStatusToNewStatus,
  removeRoadmapYamlEntry,
  replaceEntryYamlBlock,
} from './roadmap-yaml-entry.util.js';

/** Strips characters that would corrupt the pipe-table format (skill's own clean_field() convention, docs/synchronization.md write-back step 3). */
export function sanitizeField(value: string): string {
  return value
    .replace(/\|/g, '/')
    .replace(/\r\n|\r|\n/g, ' ')
    .trim();
}

/**
 * Lifecycle write-back (docs/synchronization.md write-back step 4-5, Roadmap
 * GAP-19): a task event (created, status change, locked reassign) updates
 * whichever cells of its row a table actually has, **in whichever table
 * already holds the row** — a Near term row stays in Near term, a Blocked
 * row (which has neither Outcome/Acceptance check/Status/Depends on) only
 * ever gets its Owner cell touched, and every other cell of that row is left
 * exactly as the document has it. Only when no table holds the externalId
 * yet (a brand-new task's very first write-back) does this insert a new row,
 * always into Active work — the same "currently active" default write-back
 * has always used for creation.
 */
export function upsertLifecycleRoadmapRow(
  markdown: string,
  externalId: string,
  fields: {
    outcome: string;
    acceptanceCheck: string;
    status: string;
    /** The task's assignee, or null when it has none (an existing owner is then left as it is). */
    owner: RoadmapOwner | null;
    dependsOn: string;
    /** Written into a new YAML entry only; the tables have no such column, and an existing entry keeps its own. */
    priority?: string | null;
    progress?: number | null;
    /** The id of the entry the task sits under (`parent`), and whether that is a task, which makes this a SUBTASK — Roadmap GAP-35d. */
    parent?: string | null;
    subtask?: boolean;
  },
): string {
  if (looksLikeNewFormatRoadmap(markdown)) {
    return upsertLifecycleRoadmapEntry(markdown, externalId, fields);
  }

  const lines = markdown.split(/\r?\n/);
  const eol = detectLineEnding(markdown);
  const skill = isSkillRoadmap(markdown);
  const cellByHeader: Record<string, string> = {
    ID: sanitizeField(externalId),
    Outcome: sanitizeField(fields.outcome),
    'Acceptance check': sanitizeField(fields.acceptanceCheck),
    // The skill's own check rejects a Status outside TODO / IN_PROGRESS /
    // PAUSE / DONE; every other document keeps the verbatim Kanban state
    // (ADR-002).
    Status: sanitizeField(
      skill ? workflowStatusFor(fields.status) : fields.status,
    ),
    Owner: sanitizeField(ownerCell(fields.owner, new Date().toISOString())),
    'Depends on': sanitizeField(fields.dependsOn),
  };

  // The row is wherever the document has it — Active work, Near term, a Plan
  // table, the Gaps table — never only the first table of its shape.
  for (const range of findAllRoadmapTableRanges(lines)) {
    const idIndex = range.headers.indexOf('ID');
    if (idIndex === -1) {
      continue;
    }
    for (let i = range.rowsStart; i < range.rowsEnd; i++) {
      const cells = splitRow(lines[i].trim());
      if (cells[idIndex] !== externalId) {
        continue;
      }
      const values = withHeaderAliases(range.headers, cellByHeader);
      if (skill) {
        keepPauseUnlessDone(range.headers, cells, values);
      }
      // Only overwrite cells this table's own headers carry — a header the
      // table lacks (Blocked has no Outcome/Status; Near term has no Owner)
      // simply isn't in `values`, so its existing cell passes through
      // unchanged.
      const padded = range.headers.map((header, index) =>
        header in values ? values[header] : (cells[index] ?? '—'),
      );
      lines[i] = `| ${padded.join(' | ')} |`;
      return lines.join(eol);
    }
  }

  // No table holds this row yet: a brand-new task's first write-back always
  // lands in Active (docs/synchronization.md write-back step 4).
  const activeRange = findRoadmapTableLineRange(lines, RoadmapTable.ACTIVE);
  if (!activeRange) {
    throw new Error('Roadmap.md has no Active work table to write into');
  }
  const newLine = renderRow(activeRange.headers, cellByHeader);
  lines.splice(activeRange.rowsEnd, 0, newLine);
  return lines.join(eol);
}

/**
 * Field-edit write-back (docs/synchronization.md "Field edits"): rewrites
 * only the named cells of the row matching `externalId`, in whichever table
 * holds it, leaving every other cell and row untouched — a Near term row
 * stays in Near term. Headers the row's table lacks (Blocked has no Outcome)
 * are skipped and left out of `replaced`. Returns null when no table holds
 * the row.
 */
export function replaceRoadmapRowCells(
  markdown: string,
  externalId: string,
  cellsByHeader: Record<string, string>,
): { markdown: string; replaced: string[] } | null {
  if (looksLikeNewFormatRoadmap(markdown)) {
    return replaceRoadmapEntryFields(markdown, externalId, cellsByHeader);
  }

  const lines = markdown.split(/\r?\n/);
  const eol = detectLineEnding(markdown);
  const skill = isSkillRoadmap(markdown);
  for (const range of findAllRoadmapTableRanges(lines)) {
    const idIndex = range.headers.indexOf('ID');
    if (idIndex === -1) {
      continue;
    }
    for (let i = range.rowsStart; i < range.rowsEnd; i++) {
      const cells = splitRow(lines[i].trim());
      if (cells[idIndex] !== externalId) {
        continue;
      }
      // A key names the cell of the row's own table: the skill's Gaps table
      // calls the row's text Description where the others say Outcome.
      const targets = Object.keys(cellsByHeader)
        .map((key) => ({ key, header: targetHeader(range.headers, key) }))
        .filter(({ header }) => range.headers.includes(header));
      const values: Record<string, string> = {};
      for (const { key, header } of targets) {
        values[header] =
          skill && key === 'Status'
            ? workflowStatusFor(cellsByHeader[key])
            : cellsByHeader[key];
      }
      if (skill && 'Status' in values) {
        keepPauseUnlessDone(range.headers, cells, values);
      }
      const replaced = targets
        .filter(({ header }) => header in values)
        .map(({ key }) => key);
      const written = Object.keys(values);
      if (written.length > 0) {
        for (const header of written) {
          cells[range.headers.indexOf(header)] =
            sanitizeField(values[header]) || '—';
        }
        const padded = range.headers.map((_, index) => cells[index] ?? '—');
        lines[i] = `| ${padded.join(' | ')} |`;
      }
      return { markdown: lines.join(eol), replaced };
    }
  }
  return null;
}

/**
 * Assignment write-back (Roadmap GAP-35a): rewrites only who the row or entry
 * names as its assignee — the Owner cell of the old tables, or exactly one
 * owner form of an entry (`applyOwnerToEntry`) — leaving everything else
 * byte-for-byte. Returns null when there is nothing to write into: no such
 * row, or a table with no Owner column (Near term).
 */
export function replaceRoadmapOwner(
  markdown: string,
  externalId: string,
  owner: RoadmapOwner,
  claimedAtIso: string,
): string | null {
  if (looksLikeNewFormatRoadmap(markdown)) {
    const entry = extractRoadmapYamlEntriesForWrite(markdown, externalId).find(
      (candidate) => candidate.id === externalId,
    );
    if (!entry) {
      return null;
    }
    return replaceEntryYamlBlock(markdown, entry, (doc) => {
      applyOwnerToEntry(doc, owner);
      doc.set('updated_at', claimedAtIso);
    });
  }
  const written = replaceRoadmapRowCells(markdown, externalId, {
    Owner: ownerCell(owner, claimedAtIso),
  });
  return written && written.replaced.length > 0 ? written.markdown : null;
}

/**
 * Removal write-back (docs/synchronization.md "Removal"): takes the row
 * matching `externalId` out of whichever table holds it. A table left with no
 * rows gets the `—` placeholder row back, so its shape stays what the
 * project-documentation skill expects. Returns null when no table holds the
 * row.
 */
export function removeRoadmapRow(
  markdown: string,
  externalId: string,
): string | null {
  if (looksLikeNewFormatRoadmap(markdown)) {
    return removeRoadmapYamlEntry(markdown, externalId);
  }

  const lines = markdown.split(/\r?\n/);
  const eol = detectLineEnding(markdown);
  for (const range of findAllRoadmapTableRanges(lines)) {
    const idIndex = range.headers.indexOf('ID');
    if (idIndex === -1) {
      continue;
    }
    for (let i = range.rowsStart; i < range.rowsEnd; i++) {
      if (splitRow(lines[i].trim())[idIndex] !== externalId) {
        continue;
      }
      if (range.rowsEnd - range.rowsStart === 1) {
        lines[i] = renderRow(range.headers, {});
      } else {
        lines.splice(i, 1);
      }
      return lines.join(eol);
    }
  }
  return null;
}

/** The header a key names in this table: `Outcome` is `Description` where the table has no Outcome column. */
function targetHeader(headers: string[], key: string): string {
  return key === 'Outcome' &&
    !headers.includes('Outcome') &&
    headers.includes('Description')
    ? 'Description'
    : key;
}

function withHeaderAliases(
  headers: string[],
  cellByHeader: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(cellByHeader).map(([key, value]) => [
      targetHeader(headers, key),
      value,
    ]),
  );
}

/**
 * A skill row that is PAUSE stays PAUSE, with its reason, through a write
 * that would otherwise mark it started (the same rule a BLOCKED YAML entry
 * follows); only completing it changes the state, and then the reason goes
 * too, as the skill's own `done` clears it.
 */
function keepPauseUnlessDone(
  headers: string[],
  cells: string[],
  values: Record<string, string>,
): void {
  const statusIndex = headers.indexOf('Status');
  if (statusIndex === -1 || !isPauseCell(cells[statusIndex])) {
    return;
  }
  if (values.Status === 'DONE') {
    if (headers.includes('Pause reason')) {
      values['Pause reason'] = '—';
    }
    return;
  }
  delete values.Status;
}

function renderRow(
  headers: string[],
  cellByHeader: Record<string, string>,
): string {
  const cells = headers.map((header) => cellByHeader[header] ?? '—');
  return `| ${cells.join(' | ')} |`;
}

function parseDependsOnList(dependsOn: string): string[] | undefined {
  const trimmed = dependsOn.trim();
  if (!trimmed || trimmed === '—') {
    return undefined;
  }
  return trimmed
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/** A brand-new entry's assignee, in the same one-form-only shape `applyOwnerToEntry` writes. */
function ownerToPlainData(
  data: Record<string, unknown>,
  owner: RoadmapOwner | null,
): void {
  if (!owner) {
    return;
  }
  if (owner.kind === 'AI_AGENT') {
    data.executor = 'AI';
    data.assigned_agent = owner.name;
    return;
  }
  data.executor = 'HUMAN';
  data.owner = { type: 'HUMAN', name: owner.name };
}

/** New-format sibling of `upsertLifecycleRoadmapRow` — same "whichever entry already holds this id, else append" contract. */
function upsertLifecycleRoadmapEntry(
  markdown: string,
  externalId: string,
  fields: {
    outcome: string;
    acceptanceCheck: string;
    status: string;
    /** The task's assignee, or null when it has none (an existing owner is then left as it is). */
    owner: RoadmapOwner | null;
    dependsOn: string;
    priority?: string | null;
    progress?: number | null;
    parent?: string | null;
    subtask?: boolean;
  },
): string {
  const entries = extractRoadmapYamlEntriesForWrite(markdown, externalId);
  const entry = entries.find((candidate) => candidate.id === externalId);
  const nowIso = new Date().toISOString();
  const newStatus = mapTaskStatusToNewStatus(fields.status as TaskStatus);
  if (entry) {
    const currentStatus =
      typeof entry.data.status === 'string'
        ? entry.data.status.trim().toUpperCase()
        : undefined;
    const isCurrentlyBlocked = currentStatus === 'BLOCKED';
    return replaceEntryYamlBlock(markdown, entry, (doc) => {
      // Mirrors the old format's Blocked table, which has no Status column
      // at all — a lifecycle write-back against a row already there can
      // only ever touch Owner. A new-format entry with `status: BLOCKED`
      // gets the same treatment: `status`/`blocked_by` pass through
      // unchanged so an unrelated write-back (e.g. a task's own status
      // change elsewhere) can't silently clear the blocked state.
      if (!isCurrentlyBlocked) {
        doc.set('status', newStatus);
      }
      doc.set('updated_at', nowIso);
      if (fields.owner) {
        applyOwnerToEntry(doc, fields.owner);
      }
    });
  }

  const data: Record<string, unknown> = {
    id: externalId,
    type: fields.subtask ? 'SUBTASK' : 'TASK',
    title: sanitizeField(fields.outcome),
    status: newStatus,
    description: sanitizeField(fields.outcome),
    acceptance_criteria: fields.acceptanceCheck
      ? [
          {
            id: 'AC-1',
            description: sanitizeField(fields.acceptanceCheck),
            status: 'pending',
          },
        ]
      : undefined,
    depends_on: parseDependsOnList(fields.dependsOn),
    parent: fields.parent ?? undefined,
    priority: newEntryPriority(fields.priority),
    progress: fields.progress ?? undefined,
    created_at: nowIso,
    updated_at: nowIso,
  };
  ownerToPlainData(data, fields.owner);
  return appendRoadmapYamlEntry(markdown, data);
}

function newEntryPriority(
  priority: string | null | undefined,
): string | undefined {
  const level = priorityFromDocument(priority);
  return level ? priorityToDocument(level) : undefined;
}

/** New-format sibling of `replaceRoadmapRowCells`. Returns null when no entry with this id exists. */
function replaceRoadmapEntryFields(
  markdown: string,
  externalId: string,
  cellsByHeader: Record<string, string>,
): { markdown: string; replaced: string[] } | null {
  const entries = extractRoadmapYamlEntriesForWrite(markdown, externalId);
  const entry = entries.find((candidate) => candidate.id === externalId);
  if (!entry) {
    return null;
  }

  const replaced: string[] = [];
  const updatedMarkdown = replaceEntryYamlBlock(markdown, entry, (doc) => {
    if ('Outcome' in cellsByHeader) {
      doc.set('title', sanitizeField(cellsByHeader.Outcome) || entry.id);
      replaced.push('Outcome');
    }
    if ('Acceptance check' in cellsByHeader) {
      const text = sanitizeField(cellsByHeader['Acceptance check']);
      doc.set(
        'acceptance_criteria',
        text ? [{ id: 'AC-1', description: text, status: 'pending' }] : [],
      );
      replaced.push('Acceptance check');
    }
    if ('Status' in cellsByHeader) {
      // A BLOCKED entry keeps its status; the old Blocked table has no Status
      // column at all.
      const current = doc.get('status');
      if (String(current).trim().toUpperCase() !== 'BLOCKED') {
        doc.set(
          'status',
          mapTaskStatusToNewStatus(cellsByHeader.Status as TaskStatus),
        );
        replaced.push('Status');
      }
    }
    if ('Depends on' in cellsByHeader) {
      doc.set(
        'depends_on',
        parseDependsOnList(cellsByHeader['Depends on']) ?? [],
      );
      replaced.push('Depends on');
    }
    // Only an entry has these (Roadmap GAP-35c): the table formats have no
    // such column, so a table skips both. An empty value takes the field out.
    if ('Priority' in cellsByHeader) {
      const level = priorityFromDocument(cellsByHeader.Priority);
      if (level) {
        doc.set('priority', priorityToDocument(level, doc.get('priority')));
      } else {
        doc.delete('priority');
      }
      replaced.push('Priority');
    }
    // Where the task sits (Roadmap GAP-35d). Clearing it takes out the shortcuts
    // to an ancestor too: they name a place as well, and would put it back.
    if ('Parent' in cellsByHeader) {
      const parent = cellsByHeader.Parent.trim();
      if (parent) {
        doc.set('parent', parent);
      } else {
        for (const key of ['parent', 'feature', 'epic', 'theme', 'phase']) {
          doc.delete(key);
        }
      }
      replaced.push('Parent');
    }
    if ('Progress' in cellsByHeader) {
      const percent = progressFromDocument(cellsByHeader.Progress);
      if (percent === undefined) {
        doc.delete('progress');
      } else {
        doc.set('progress', percent);
      }
      replaced.push('Progress');
    }
    if (replaced.length > 0) {
      doc.set('updated_at', new Date().toISOString());
    }
  });
  return { markdown: updatedMarkdown, replaced };
}
