/**
 * The line ending a document uses: CRLF when its first line break is one,
 * LF otherwise (Roadmap GAP-35e). The writers edit a document line by line
 * and put it back together; joining with a fixed `\n` rewrote every line of a
 * CRLF file, so one changed row showed up as a whole-file diff. A file with
 * mixed endings is normalised to its first one — the only case where a
 * write-back still touches lines it did not edit.
 */
export function detectLineEnding(text: string): '\r\n' | '\n' {
  const firstBreak = text.indexOf('\n');
  return firstBreak > 0 && text[firstBreak - 1] === '\r' ? '\r\n' : '\n';
}
