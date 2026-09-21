import { describe, expect, it } from 'vitest';
import { detectLineEnding } from './line-ending.util.js';

describe('detectLineEnding (Roadmap GAP-35e)', () => {
  it('reads CRLF, LF and no line break at all', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('\r\n');
    expect(detectLineEnding('a\nb\n')).toBe('\n');
    expect(detectLineEnding('one line')).toBe('\n');
    expect(detectLineEnding('')).toBe('\n');
  });

  it('follows the first line break of a file with mixed endings', () => {
    expect(detectLineEnding('a\r\nb\nc\n')).toBe('\r\n');
    expect(detectLineEnding('a\nb\r\nc\r\n')).toBe('\n');
  });
});
