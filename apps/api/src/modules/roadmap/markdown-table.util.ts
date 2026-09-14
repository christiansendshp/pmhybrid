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

function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.length > 1;
}

function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) {
    return false;
  }
  return splitRow(line).every((cell) => /^:?-+:?$/.test(cell));
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}
