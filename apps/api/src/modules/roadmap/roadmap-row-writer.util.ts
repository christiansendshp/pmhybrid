import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import { findRoadmapTableLineRange, splitRow } from './markdown-table.util.js';
import {
  appendRoadmapYamlEntry,
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
    owner: string;
    dependsOn: string;
  },
): string {
  if (looksLikeNewFormatRoadmap(markdown)) {
    return upsertLifecycleRoadmapEntry(markdown, externalId, fields);
  }

  const lines = markdown.split(/\r?\n/);
  const cellByHeader: Record<string, string> = {
    ID: sanitizeField(externalId),
    Outcome: sanitizeField(fields.outcome),
    'Acceptance check': sanitizeField(fields.acceptanceCheck),
    Status: sanitizeField(fields.status),
    Owner: sanitizeField(fields.owner),
    'Depends on': sanitizeField(fields.dependsOn),
  };

  for (const kind of Object.values(RoadmapTable)) {
    const range = findRoadmapTableLineRange(lines, kind);
    const idIndex = range?.headers.indexOf('ID') ?? -1;
    if (!range || idIndex === -1) {
      continue;
    }
    for (let i = range.rowsStart; i < range.rowsEnd; i++) {
      const cells = splitRow(lines[i].trim());
      if (cells[idIndex] !== externalId) {
        continue;
      }
      // Only overwrite cells this table's own headers carry — a header the
      // table lacks (Blocked has no Outcome/Status; Near term has no Owner)
      // simply isn't in `cellByHeader`'s effect here, so its existing cell
      // passes through unchanged.
      const padded = range.headers.map((header, index) =>
        header in cellByHeader ? cellByHeader[header] : (cells[index] ?? '—'),
      );
      lines[i] = `| ${padded.join(' | ')} |`;
      return lines.join('\n');
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
  return lines.join('\n');
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
  for (const kind of Object.values(RoadmapTable)) {
    const range = findRoadmapTableLineRange(lines, kind);
    const idIndex = range?.headers.indexOf('ID') ?? -1;
    if (!range || idIndex === -1) {
      continue;
    }
    for (let i = range.rowsStart; i < range.rowsEnd; i++) {
      const cells = splitRow(lines[i].trim());
      if (cells[idIndex] !== externalId) {
        continue;
      }
      const replaced = Object.keys(cellsByHeader).filter((header) =>
        range.headers.includes(header),
      );
      if (replaced.length > 0) {
        for (const header of replaced) {
          cells[range.headers.indexOf(header)] =
            sanitizeField(cellsByHeader[header]) || '—';
        }
        const padded = range.headers.map((_, index) => cells[index] ?? '—');
        lines[i] = `| ${padded.join(' | ')} |`;
      }
      return { markdown: lines.join('\n'), replaced };
    }
  }
  return null;
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
  for (const kind of Object.values(RoadmapTable)) {
    const range = findRoadmapTableLineRange(lines, kind);
    const idIndex = range?.headers.indexOf('ID') ?? -1;
    if (!range || idIndex === -1) {
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
      return lines.join('\n');
    }
  }
  return null;
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

/** Owner-cell convention (docs/roadmap-parser.md): "Name@timestamp" is an AI agent, a bare name is a human. */
function applyOwnerCellToPlainData(
  data: Record<string, unknown>,
  ownerCell: string,
): void {
  const trimmed = ownerCell.trim();
  if (!trimmed || trimmed === '—') {
    return;
  }
  const at = trimmed.lastIndexOf('@');
  if (at !== -1) {
    data.assigned_agent = trimmed.slice(0, at).trim();
    data.executor = 'AI';
  } else {
    data.owner = { type: 'HUMAN', name: trimmed };
  }
}

/** New-format sibling of `upsertLifecycleRoadmapRow` — same "whichever entry already holds this id, else append" contract. */
function upsertLifecycleRoadmapEntry(
  markdown: string,
  externalId: string,
  fields: {
    outcome: string;
    acceptanceCheck: string;
    status: string;
    owner: string;
    dependsOn: string;
  },
): string {
  const entries = extractRoadmapYamlEntriesForWrite(markdown, externalId);
  const entry = entries.find((candidate) => candidate.id === externalId);
  const nowIso = new Date().toISOString();
  const newStatus = mapTaskStatusToNewStatus(fields.status as TaskStatus);
  const ownerCell = sanitizeField(fields.owner);

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
      const trimmedOwner = ownerCell.trim();
      if (trimmedOwner && trimmedOwner !== '—') {
        const at = trimmedOwner.lastIndexOf('@');
        if (at !== -1) {
          doc.set('assigned_agent', trimmedOwner.slice(0, at).trim());
          doc.set('executor', 'AI');
        } else {
          doc.set('owner', { type: 'HUMAN', name: trimmedOwner });
        }
      }
    });
  }

  const data: Record<string, unknown> = {
    id: externalId,
    type: 'TASK',
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
    created_at: nowIso,
    updated_at: nowIso,
  };
  applyOwnerCellToPlainData(data, ownerCell);
  return appendRoadmapYamlEntry(markdown, data);
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
    if ('Depends on' in cellsByHeader) {
      doc.set(
        'depends_on',
        parseDependsOnList(cellsByHeader['Depends on']) ?? [],
      );
      replaced.push('Depends on');
    }
    if (replaced.length > 0) {
      doc.set('updated_at', new Date().toISOString());
    }
  });
  return { markdown: updatedMarkdown, replaced };
}
