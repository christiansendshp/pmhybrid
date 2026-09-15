import { describe, expect, it } from 'vitest';
import {
  replaceRoadmapRowCells,
  upsertActiveRoadmapRow,
} from './roadmap-row-writer.util.js';

const ROADMAP = `# Roadmap

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on |
|---|---|---|---|---|---|
| PMH-1 | First task | check it | PENDIENTE | — | — |

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
|---|---|---|---|---|
| PMH-2 | Later | later check | TODO | — |
`;

describe('upsertActiveRoadmapRow', () => {
  it('replaces an existing row in place without touching other rows or tables', () => {
    const updated = upsertActiveRoadmapRow(ROADMAP, 'PMH-1', {
      outcome: 'First task',
      acceptanceCheck: 'check it',
      status: 'EN DESARROLLO',
      owner: 'claude-code',
      dependsOn: '—',
    });

    expect(updated).toContain(
      '| PMH-1 | First task | check it | EN DESARROLLO | claude-code | — |',
    );
    expect(updated).toContain('| PMH-2 | Later | later check | TODO | — |');
    // Only one Active-work row line, not a duplicate.
    expect(updated.match(/PMH-1/g)).toHaveLength(1);
  });

  it('appends a new row when the externalId is not yet present', () => {
    const updated = upsertActiveRoadmapRow(ROADMAP, 'PMH-3', {
      outcome: 'Brand new',
      acceptanceCheck: 'n/a',
      status: 'PENDIENTE',
      owner: '—',
      dependsOn: '—',
    });

    expect(updated).toContain(
      '| PMH-1 | First task | check it | PENDIENTE | — | — |',
    );
    expect(updated).toContain(
      '| PMH-3 | Brand new | n/a | PENDIENTE | — | — |',
    );
  });

  it('sanitizes pipe and newline characters that would corrupt the table', () => {
    const updated = upsertActiveRoadmapRow(ROADMAP, 'PMH-1', {
      outcome: 'has a | pipe\nand a newline',
      acceptanceCheck: 'ok',
      status: 'PENDIENTE',
      owner: '—',
      dependsOn: '—',
    });

    expect(updated).toContain('has a / pipe and a newline');
  });
});

describe('replaceRoadmapRowCells', () => {
  const BLOCKED = `${ROADMAP}
## Blocked

| ID | Blocker | Needed decision or event | Owner |
|---|---|---|---|
| PMH-4 | Waiting on legal | Sign-off | Ana |
`;

  it('rewrites only the named cells, keeping the row in its own table', () => {
    const result = replaceRoadmapRowCells(ROADMAP, 'PMH-2', {
      Outcome: 'Later, renamed',
      'Acceptance check': 'new check',
    });

    expect(result?.replaced).toEqual(['Outcome', 'Acceptance check']);
    expect(result?.markdown).toContain(
      '| PMH-2 | Later, renamed | new check | TODO | — |',
    );
    expect(result?.markdown).toContain(
      '| PMH-1 | First task | check it | PENDIENTE | — | — |',
    );
    expect(result?.markdown.match(/PMH-2/g)).toHaveLength(1);
  });

  it('leaves the other cells of an Active row exactly as the document has them', () => {
    const result = replaceRoadmapRowCells(ROADMAP, 'PMH-1', {
      Outcome: 'First task | v2',
    });

    expect(result?.markdown).toContain(
      '| PMH-1 | First task / v2 | check it | PENDIENTE | — | — |',
    );
  });

  it('skips headers the row table lacks, and returns null for an unknown row', () => {
    const blocked = replaceRoadmapRowCells(BLOCKED, 'PMH-4', {
      Outcome: 'Not a Blocked column',
    });
    expect(blocked?.replaced).toEqual([]);
    expect(blocked?.markdown).toBe(BLOCKED.split(/\r?\n/).join('\n'));

    expect(
      replaceRoadmapRowCells(ROADMAP, 'PMH-99', { Outcome: 'x' }),
    ).toBeNull();
  });
});
