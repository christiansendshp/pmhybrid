import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RoadmapParserService } from './roadmap-parser.service.js';

/**
 * This repository is itself a project PM Hub manages (`docsPath` is its own
 * `docs/`), so an entry the parser cannot read is a warning on the running
 * app's own project page and a task frozen out of sync. A colon followed by a
 * space in an unquoted title was enough (Roadmap UX-03c1); this catches it
 * before it is committed.
 */
describe("this repository's docs/Roadmap.md", () => {
  const markdown = readFileSync(
    new URL('../../../../../docs/Roadmap.md', import.meta.url),
    'utf-8',
  );
  const { rows, errors } = new RoadmapParserService().parseTolerant(markdown);

  it('is read in full: no entry the parser cannot understand', () => {
    expect(
      errors.map(
        (error) => `${error.id} (line ${error.line}): ${error.reason}`,
      ),
    ).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('gives every entry a status the sync knows', () => {
    expect(
      rows
        .filter((row) => row.statusUnrecognized)
        .map((row) => `${row.externalId}: ${row.statusRaw}`),
    ).toEqual([]);
  });
});
