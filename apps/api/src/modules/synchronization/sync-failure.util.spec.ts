import { describe, expect, it } from 'vitest';
import { RoadmapFormatError } from '../roadmap/roadmap-yaml-entry.util.js';
import {
  describeSyncFailure,
  sanitizeSyncMessage,
} from './sync-failure.util.js';

describe('sanitizeSyncMessage (Roadmap BUG-05)', () => {
  it('keeps the first line only — a yaml code frame is not a message', () => {
    const frame =
      'Nested mappings are not allowed at line 3, column 8:\n\n  title: A: b\n         ^';
    expect(sanitizeSyncMessage(frame)).toBe(
      'Nested mappings are not allowed at line 3, column 8:',
    );
  });

  it('strips Windows, UNC and POSIX absolute paths', () => {
    expect(
      sanitizeSyncMessage(
        String.raw`ENOENT: no such file or directory, open 'C:\Users\me\proj\Roadmap.md'`,
      ),
    ).toBe("ENOENT: no such file or directory, open '<path>'");
    expect(
      sanitizeSyncMessage(String.raw`open \\server\share\docs\Roadmap.md`),
    ).toBe('open <path>');
    expect(sanitizeSyncMessage('cannot open /srv/projects/x/Roadmap.md')).toBe(
      'cannot open <path>',
    );
  });

  it('leaves ordinary text with slashes alone', () => {
    expect(sanitizeSyncMessage('either/or, 3/4 done')).toBe(
      'either/or, 3/4 done',
    );
  });

  it('bounds the length', () => {
    expect(sanitizeSyncMessage('x'.repeat(1000))).toHaveLength(300);
  });
});

describe('describeSyncFailure (Roadmap BUG-05)', () => {
  it('treats a malformed document as fixable by the project, with a readable message', () => {
    const failure = describeSyncFailure(
      new RoadmapFormatError('Roadmap.md: unterminated ```yaml block'),
    );
    expect(failure).toEqual({
      message: 'Roadmap.md: unterminated ```yaml block',
      fixable: true,
    });
  });

  it('treats a missing/unreadable docs folder as fixable without leaking the path', () => {
    const error = Object.assign(
      new Error(
        String.raw`ENOENT: no such file or directory, open 'C:\secret\x.md'`,
      ),
      { code: 'ENOENT' },
    );
    const failure = describeSyncFailure(error);
    expect(failure.fixable).toBe(true);
    expect(failure.message).toContain('ENOENT');
    expect(failure.message).not.toContain('secret');
  });

  it('leaves everything else as a server-side failure, sanitized', () => {
    const failure = describeSyncFailure(
      new Error('connect ECONNREFUSED 10.0.0.5:5432\n    at stack...'),
    );
    expect(failure.fixable).toBe(false);
    expect(failure.message).toBe('connect ECONNREFUSED 10.0.0.5:5432');
    expect(describeSyncFailure('boom').message).toBe('Unknown error');
  });
});
