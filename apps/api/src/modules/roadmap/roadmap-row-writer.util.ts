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
 * Surgical single-row edit: replaces the row matching `externalId` within
 * the Active work table, or appends it if not present — never touches any
 * other row (docs/synchronization.md write-back step 5). Write-back only
 * ever targets the Active table (FASE-08 scope: UI-driven task lifecycle
 * events read as "currently active work" — Near term/Blocked are populated
 * by human edits to the document, not by the app).
 */
export function upsertActiveRoadmapRow(
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
  const range = findRoadmapTableLineRange(lines, RoadmapTable.ACTIVE);
  if (!range) {
    throw new Error('Roadmap.md has no Active work table to write into');
  }

  const cellByHeader: Record<string, string> = {
    ID: sanitizeField(externalId),
    Outcome: sanitizeField(fields.outcome),
    'Acceptance check': sanitizeField(fields.acceptanceCheck),
    Status: sanitizeField(fields.status),
    Owner: sanitizeField(fields.owner),
    'Depends on': sanitizeField(fields.dependsOn),
  };
  const newLine = renderRow(range.headers, cellByHeader);

  const idIndex = range.headers.indexOf('ID');
  let matchedLine = -1;
  for (let i = range.rowsStart; i < range.rowsEnd; i++) {
    if (splitRow(lines[i].trim())[idIndex] === externalId) {
      matchedLine = i;
      break;
    }
  }

  if (matchedLine >= 0) {
    lines[matchedLine] = newLine;
  } else {
    lines.splice(range.rowsEnd, 0, newLine);
  }

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

function renderRow(
  headers: string[],
  cellByHeader: Record<string, string>,
): string {
  const cells = headers.map((header) => cellByHeader[header] ?? '—');
  return `| ${cells.join(' | ')} |`;
}
