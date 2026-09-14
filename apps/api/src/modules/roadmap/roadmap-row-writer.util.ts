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

function renderRow(
  headers: string[],
  cellByHeader: Record<string, string>,
): string {
  const cells = headers.map((header) => cellByHeader[header] ?? '—');
  return `| ${cells.join(' | ')} |`;
}
