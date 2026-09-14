import { RoadmapTable } from '@pmhybrid/shared-types';

export interface RawMarkdownTable {
  headers: string[];
  rows: string[][];
}

/**
 * Generic GFM pipe-table extractor: a header row immediately followed by a
 * `---|---` separator row, then data rows until the block ends. Used by
 * RoadmapParserService to find the three Roadmap.md tables regardless of
 * surrounding prose or prettier's column-padding (docs/roadmap-parser.md).
 */
export function extractMarkdownTables(markdown: string): RawMarkdownTable[] {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());
  const tables: RawMarkdownTable[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1])
    ) {
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      tables.push({ headers, rows });
    } else {
      i += 1;
    }
  }

  return tables;
}

/** Column-signature discrimination (docs/roadmap-parser.md) — shared by the parser (read) and the write-back row writer. */
export function discriminateRoadmapTable(
  headers: string[],
): RoadmapTable | null {
  const set = new Set(headers);
  if (set.has('Blocker') && set.has('Needed decision or event')) {
    return RoadmapTable.BLOCKED;
  }
  if (set.has('Status') && set.has('Owner') && set.has('Depends on')) {
    return RoadmapTable.ACTIVE;
  }
  if (set.has('Status') && set.has('Depends on')) {
    return RoadmapTable.NEAR_TERM;
  }
  return null;
}

export interface TableLineRange {
  headers: string[];
  /** Index of the first data row line (headers + separator are the two lines before it). */
  rowsStart: number;
  /** Exclusive — the line index just past the table's last data row. */
  rowsEnd: number;
}

/** Same walk as extractMarkdownTables, but keeps raw (untrimmed) line indices — needed to surgically edit one row line in place. */
export function findRoadmapTableLineRange(
  lines: string[],
  kind: RoadmapTable,
): TableLineRange | null {
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (
      isTableRow(trimmed) &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1].trim())
    ) {
      const headers = splitRow(trimmed);
      const rowsStart = i + 2;
      let rowsEnd = rowsStart;
      while (rowsEnd < lines.length && isTableRow(lines[rowsEnd].trim())) {
        rowsEnd += 1;
      }
      if (discriminateRoadmapTable(headers) === kind) {
        return { headers, rowsStart, rowsEnd };
      }
      i = rowsEnd;
    } else {
      i += 1;
    }
  }
  return null;
}

export function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.length > 1;
}

function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) {
    return false;
  }
  return splitRow(line).every((cell) => /^:?-+:?$/.test(cell));
}

export function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}
