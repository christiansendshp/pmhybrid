import { describe, expect, it } from 'vitest';
import {
  removeRoadmapRow,
  replaceRoadmapRowCells,
  upsertLifecycleRoadmapRow,
} from './roadmap-row-writer.util.js';
import { extractRoadmapYamlEntries } from './roadmap-yaml-entry.util.js';

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

describe('upsertLifecycleRoadmapRow', () => {
  it('replaces an existing Active row in place without touching other rows or tables', () => {
    const updated = upsertLifecycleRoadmapRow(ROADMAP, 'PMH-1', {
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

  it('appends a new row into Active when the externalId is not yet present anywhere', () => {
    const updated = upsertLifecycleRoadmapRow(ROADMAP, 'PMH-3', {
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
    const updated = upsertLifecycleRoadmapRow(ROADMAP, 'PMH-1', {
      outcome: 'has a | pipe\nand a newline',
      acceptanceCheck: 'ok',
      status: 'PENDIENTE',
      owner: '—',
      dependsOn: '—',
    });

    expect(updated).toContain('has a / pipe and a newline');
  });

  it('Roadmap GAP-19: a status write-back on a Near term row updates it in place, never duplicating it into Active', () => {
    const updated = upsertLifecycleRoadmapRow(ROADMAP, 'PMH-2', {
      outcome: 'Later',
      acceptanceCheck: 'later check',
      status: 'EN DESARROLLO',
      owner: 'claude-code', // Near term has no Owner column — must be dropped, not error
      dependsOn: '—',
    });

    expect(updated).toContain(
      '| PMH-2 | Later | later check | EN DESARROLLO | — |',
    );
    expect(updated).not.toContain('claude-code');
    // Still exactly one row for PMH-2, and it never leaked into Active work.
    expect(updated.match(/PMH-2/g)).toHaveLength(1);
    const activeSection = updated.split('## Near term')[0];
    expect(activeSection).not.toContain('PMH-2');
  });

  it('Roadmap GAP-19: a write-back on a Blocked row only ever touches its Owner cell, leaving Blocker/decision untouched', () => {
    const blocked = `${ROADMAP}
## Blocked

| ID | Blocker | Needed decision or event | Owner |
|---|---|---|---|
| PMH-4 | Waiting on legal | Sign-off | — |
`;
    const updated = upsertLifecycleRoadmapRow(blocked, 'PMH-4', {
      outcome: 'Ignored — Blocked has no Outcome column',
      acceptanceCheck: 'Ignored too',
      status: 'EN DESARROLLO', // Blocked has no Status column — must be dropped
      owner: 'claude-code',
      dependsOn: '—',
    });

    expect(updated).toContain(
      '| PMH-4 | Waiting on legal | Sign-off | claude-code |',
    );
    expect(updated).not.toContain('Ignored');
    expect(updated.match(/PMH-4/g)).toHaveLength(1);
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

describe('removeRoadmapRow', () => {
  it('takes the row out of its own table and leaves every other row alone', () => {
    const updated = removeRoadmapRow(
      `${ROADMAP}| PMH-5 | Also later | check | TODO | — |\n`,
      'PMH-2',
    );

    expect(updated).not.toContain('PMH-2');
    expect(updated).toContain('| PMH-5 | Also later | check | TODO | — |');
    expect(updated).toContain(
      '| PMH-1 | First task | check it | PENDIENTE | — | — |',
    );
  });

  it('puts the placeholder row back when the table would be left empty', () => {
    const updated = removeRoadmapRow(ROADMAP, 'PMH-1');

    expect(updated).not.toContain('PMH-1');
    expect(updated).toContain(
      '|---|---|---|---|---|---|\n| — | — | — | — | — | — |',
    );
  });

  it('returns null for a row no table holds', () => {
    expect(removeRoadmapRow(ROADMAP, 'PMH-99')).toBeNull();
  });
});

const NEW_FORMAT_ROADMAP = `# Roadmap

## Plan

### TASK-42 — Add sync-strategy selector

\`\`\`yaml
id: TASK-42
type: TASK
title: Add sync-strategy selector
status: READY
depends_on:
  - TASK-31
acceptance_criteria:
  - id: AC-1
    description: Original criterion.
    status: pending
\`\`\`

## Cross-cutting

### GAP-05 — Some other entry

\`\`\`yaml
id: GAP-05
type: GAP
title: Some other entry
status: BACKLOG
\`\`\`
`;

describe('upsertLifecycleRoadmapRow (new format)', () => {
  it('updates only the target entry, leaving every other entry byte-for-byte untouched', () => {
    const updated = upsertLifecycleRoadmapRow(NEW_FORMAT_ROADMAP, 'TASK-42', {
      outcome: 'Add sync-strategy selector',
      acceptanceCheck: 'Original criterion.',
      status: 'EN_DESARROLLO',
      owner: 'claude@2026-09-17T12:00:00Z',
      dependsOn: 'TASK-31',
    });

    const entries = extractRoadmapYamlEntries(updated);
    const task42 = entries.find((e) => e.id === 'TASK-42')!;
    expect(task42.data.status).toBe('IN_PROGRESS');
    expect(task42.data.assigned_agent).toBe('claude');
    expect(task42.data.executor).toBe('AI');
    // GAP-05's block is untouched.
    expect(updated).toContain('### GAP-05 — Some other entry');
    const gap05 = entries.find((e) => e.id === 'GAP-05')!;
    expect(gap05.data.status).toBe('BACKLOG');
  });

  it('appends a brand-new entry to Cross-cutting when the id does not exist yet', () => {
    const updated = upsertLifecycleRoadmapRow(NEW_FORMAT_ROADMAP, 'PMH-9', {
      outcome: 'Brand new task',
      acceptanceCheck: 'n/a',
      status: 'PENDIENTE',
      owner: '—',
      dependsOn: '—',
    });

    const entries = extractRoadmapYamlEntries(updated);
    const created = entries.find((e) => e.id === 'PMH-9')!;
    expect(created).toBeDefined();
    expect(created.type).toBe('TASK');
    expect(created.data.status).toBe('BACKLOG');
    expect(created.data.title).toBe('Brand new task');
    // Existing entries still present.
    expect(entries.map((e) => e.id)).toContain('TASK-42');
  });
});

describe('replaceRoadmapRowCells (new format)', () => {
  it('rewrites only title and acceptance_criteria, preserving every other field', () => {
    const result = replaceRoadmapRowCells(NEW_FORMAT_ROADMAP, 'TASK-42', {
      Outcome: 'Renamed task',
      'Acceptance check': 'New criterion.',
    });

    expect(result?.replaced).toEqual(['Outcome', 'Acceptance check']);
    const entries = extractRoadmapYamlEntries(result!.markdown);
    const task42 = entries.find((e) => e.id === 'TASK-42')!;
    expect(task42.data.title).toBe('Renamed task');
    expect(task42.data.acceptance_criteria).toEqual([
      { id: 'AC-1', description: 'New criterion.', status: 'pending' },
    ]);
    // depends_on, untouched by this edit, survives verbatim.
    expect(task42.data.depends_on).toEqual(['TASK-31']);
  });

  it('returns null for an id no entry holds', () => {
    expect(
      replaceRoadmapRowCells(NEW_FORMAT_ROADMAP, 'PMH-99', { Outcome: 'x' }),
    ).toBeNull();
  });
});

describe('removeRoadmapRow (new format)', () => {
  it('removes the whole entry (heading + block) and leaves the rest intact', () => {
    const updated = removeRoadmapRow(NEW_FORMAT_ROADMAP, 'TASK-42');
    expect(updated).not.toBeNull();
    expect(updated).not.toContain('TASK-42');
    expect(updated).toContain('### GAP-05 — Some other entry');
    const entries = extractRoadmapYamlEntries(updated!);
    expect(entries.map((e) => e.id)).toEqual(['GAP-05']);
  });

  it('returns null for an id no entry holds', () => {
    expect(removeRoadmapRow(NEW_FORMAT_ROADMAP, 'PMH-99')).toBeNull();
  });
});
