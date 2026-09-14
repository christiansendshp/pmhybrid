import { describe, expect, it } from 'vitest';
import { upsertActiveRoadmapRow } from './roadmap-row-writer.util.js';

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
