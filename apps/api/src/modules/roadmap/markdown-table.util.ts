import { RoadmapTable } from '@pmhybrid/shared-types';

/** A phase or an epic named by a heading of the Plan section: `### F01 — Title` or `#### F01-E01 — Title` (Roadmap GAP-38). */
export interface PlanHeading {
  id: string;
  title: string;
}

export interface RawMarkdownTable {
  headers: string[];
  rows: string[][];
  /** 1-based line of each data row in the document, parallel to `rows`. */
  rowLines: number[];
  /** The phase and the epic heading the table sits under, in the `## Plan` section. */
  phase?: PlanHeading;
  epic?: PlanHeading;
}

/** A phase or epic heading of the Plan section, as the hierarchy sync reads it. */
export interface PlanStructureHeading extends PlanHeading {
  kind: 'PHASE' | 'EPIC';
  /** For an epic, the phase heading it is under. */
  phaseId?: string;
}

const HEADING_LINE = /^(#{2,4})\s+(.*)$/;
const HEADING_TEXT = /^(\S+)\s+[—–-]\s+(.+)$/;

/**
 * Follows the headings of a document line by line, so that whatever is read
 * next knows the phase and the epic it is under (Roadmap GAP-38). The latest
 * project-documentation skill keeps its hierarchy there: inside `## Plan`, a
 * `###` heading names a phase and a `####` heading an epic, each as `ID —
 * Title`; a heading of any other shape names nothing, and a new `##` section
 * leaves the Plan. Lines inside a code fence are not headings.
 */
class PlanHeadings {
  private inPlan = false;
  private inFence = false;
  phase?: PlanHeading;
  epic?: PlanHeading;

  /** Reads one (trimmed) line; returns the phase or epic heading it names, if it names one. */
  read(line: string): PlanStructureHeading | undefined {
    if (line.startsWith('```')) {
      this.inFence = !this.inFence;
      return undefined;
    }
    const heading = this.inFence ? null : HEADING_LINE.exec(line);
    if (!heading) {
      return undefined;
    }
    const level = heading[1].length;
    const text = heading[2].trim();
    if (level === 2) {
      this.inPlan = text.toLowerCase() === 'plan';
      this.phase = undefined;
      this.epic = undefined;
      return undefined;
    }
    if (!this.inPlan) {
      return undefined;
    }
    const named = HEADING_TEXT.exec(text);
    const found = named ? { id: named[1], title: named[2].trim() } : undefined;
    if (level === 3) {
      this.phase = found;
      this.epic = undefined;
      return found && { ...found, kind: 'PHASE' };
    }
    this.epic = found;
    return found && { ...found, kind: 'EPIC', phaseId: this.phase?.id };
  }
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
  const headings = new PlanHeadings();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1])
    ) {
      const headers = splitRow(line);
      const phase = headings.phase;
      const epic = headings.epic;
      i += 2;
      const rows: string[][] = [];
      const rowLines: number[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        rowLines.push(i + 1);
        i += 1;
      }
      tables.push({
        headers,
        rows,
        rowLines,
        ...(phase ? { phase } : {}),
        ...(epic ? { epic } : {}),
      });
    } else {
      headings.read(line);
      i += 1;
    }
  }

  return tables;
}

/** Every phase and epic heading of the `## Plan` section, in document order (Roadmap GAP-38). */
export function extractPlanStructure(markdown: string): PlanStructureHeading[] {
  const headings = new PlanHeadings();
  const found: PlanStructureHeading[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const heading = headings.read(raw.trim());
    if (heading) {
      found.push(heading);
    }
  }
  return found;
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

/**
 * Every Roadmap table of the document, in order. The latest skill spreads
 * work over several tables of the same shape (Active work, one Plan table per
 * epic, Gaps), so a row is found by its ID across all of them — looking only
 * at the first table of a kind would miss a Plan row and append a duplicate
 * (Roadmap GAP-37b).
 */
export function findAllRoadmapTableRanges(
  lines: string[],
): (TableLineRange & { kind: RoadmapTable })[] {
  const ranges: (TableLineRange & { kind: RoadmapTable })[] = [];
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
      const kind = discriminateRoadmapTable(headers);
      if (kind) {
        ranges.push({ headers, rowsStart, rowsEnd, kind });
      }
      i = rowsEnd;
    } else {
      i += 1;
    }
  }
  return ranges;
}

/**
 * True when the document is written in the latest project-documentation
 * skill's table format. Its signature is the `Pause reason` column, which no
 * older table has; only then does write-back use the skill's workflow Status
 * vocabulary and ledger states, so every other document is written exactly as
 * before (Roadmap GAP-37b).
 */
export function isSkillRoadmap(markdown: string): boolean {
  return extractMarkdownTables(markdown).some(
    (table) =>
      table.headers.includes('Pause reason') &&
      discriminateRoadmapTable(table.headers) !== null,
  );
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
