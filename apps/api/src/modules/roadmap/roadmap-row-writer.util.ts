import { RoadmapTable } from '@pmhybrid/shared-types';
import { findRoadmapTableLineRange, splitRow } from './markdown-table.util.js';

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
