/** One ATX heading (`#`..`######`) found in a document's raw Markdown. */
export interface DocumentHeading {
  id: string;
  level: number;
  text: string;
  /** 0-based index into `content.split('\n')`, for scrolling/anchoring. */
  lineIndex: number;
}

const HEADING = /^(#{1,6})\s+(\S.*)$/;

/**
 * Section navigation (brief §10): every ATX heading in a document, in
 * document order, each with a stable-enough anchor id — stable within one
 * render of one document version, which is all in-page navigation needs.
 * A repeated heading text gets a numbered suffix so ids stay unique.
 */
export function extractHeadings(content: string): DocumentHeading[] {
  const seen = new Map<string, number>();
  const headings: DocumentHeading[] = [];
  content.split('\n').forEach((line, lineIndex) => {
    const match = HEADING.exec(line);
    if (!match) {
      return;
    }
    const text = match[2].trim();
    headings.push({ id: nextId(text, seen), level: match[1].length, text, lineIndex });
  });
  return headings;
}

function nextId(text: string, seen: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

export interface TextSegment {
  text: string;
  matched: boolean;
}

/**
 * Splits one line into matched/unmatched segments for `<mark>` highlighting
 * (brief §10 "resaltado"), case-insensitive. Rendered via `@for`, never
 * `[innerHTML]` — document content is untrusted free text, not markup.
 */
export function highlightSegments(line: string, query: string): TextSegment[] {
  const needle = query.trim();
  if (!needle) {
    return [{ text: line, matched: false }];
  }
  const lowerLine = line.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const segments: TextSegment[] = [];
  let start = 0;
  let index = lowerLine.indexOf(lowerNeedle, start);
  while (index !== -1) {
    if (index > start) {
      segments.push({ text: line.slice(start, index), matched: false });
    }
    segments.push({ text: line.slice(index, index + needle.length), matched: true });
    start = index + needle.length;
    index = lowerLine.indexOf(lowerNeedle, start);
  }
  if (start < line.length) {
    segments.push({ text: line.slice(start), matched: false });
  }
  return segments;
}

/** 0-based line indexes containing a case-insensitive match, for a "N matching lines" count. */
export function findMatchingLines(content: string, query: string): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const matches: number[] = [];
  content.split('\n').forEach((line, lineIndex) => {
    if (line.toLowerCase().includes(needle)) {
      matches.push(lineIndex);
    }
  });
  return matches;
}
