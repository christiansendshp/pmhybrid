import { describe, expect, it } from 'vitest';
import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import {
  extractRoadmapYamlEntries,
  extractRoadmapYamlEntriesForWrite,
  extractRoadmapYamlEntriesTolerant,
  looksLikeNewFormatRoadmap,
  mapNewStatusToTaskStatus,
  mapTaskStatusToNewStatus,
  removeRoadmapYamlEntry,
  RoadmapFormatError,
  roadmapYamlEntryToRow,
} from './roadmap-yaml-entry.util.js';

const NEW_FORMAT = `# Roadmap

## Plan

### EPIC-03 — Project creation

\`\`\`yaml
id: EPIC-03
type: EPIC
title: Project creation
status: IN_PROGRESS
parent: PHASE-01
\`\`\`

### TASK-42 — Add sync-strategy selector

\`\`\`yaml
id: TASK-42
type: TASK
title: Add sync-strategy selector
status: IN_PROGRESS
parent: EPIC-03
executor: AI
assigned_agent: claude
updated_at: 2026-09-17T10:00:00Z
depends_on:
  - TASK-31
acceptance_criteria:
  - id: AC-1
    description: The form shows a strategy selector.
    status: pending
  - id: AC-2
    description: The chosen strategy is persisted.
    status: pending
\`\`\`

## Cross-cutting

### TASK-43 — Waiting on a decision

\`\`\`yaml
id: TASK-43
type: TASK
title: Waiting on a decision
status: BLOCKED
blocked_by:
  - DEC-007
owner:
  type: HUMAN
  name: Cristian
\`\`\`
`;

// A 4-backtick fence whose own body contains a literal 3-backtick run --
// exactly what prettier emits for an entry whose description quotes this
// file's own \`\`\`yaml fence syntax (Roadmap GAP-28's BUG-01, found live).
const ESCALATED_FENCE = `### BUG-99 — Fence escalation test

\`\`\`\`yaml
id: BUG-99
type: BUG
title: Fence escalation test
status: BACKLOG
description: >
  Mentions a literal \`\`\`yaml sequence inline, which is why prettier
  escalates this entry's own fence to four backticks.
next_action: value after the embedded backticks
\`\`\`\`
`;

const OLD_FORMAT = `# Roadmap

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on |
|---|---|---|---|---|---|
| PMH-1 | First task | check it | PENDIENTE | — | — |
`;

describe('looksLikeNewFormatRoadmap', () => {
  it('detects an entry heading immediately followed by a yaml fence', () => {
    expect(looksLikeNewFormatRoadmap(NEW_FORMAT)).toBe(true);
  });

  it('does not mistake an old-format table document for the new format', () => {
    expect(looksLikeNewFormatRoadmap(OLD_FORMAT)).toBe(false);
  });

  it('does not mistake a section heading with no yaml fence for an entry', () => {
    expect(
      looksLikeNewFormatRoadmap('# Roadmap\n\n## Plan\n\nNo entries yet.\n'),
    ).toBe(false);
  });

  it('detects a fence escalated to 4+ backticks (prettier output), not just exactly 3', () => {
    expect(looksLikeNewFormatRoadmap(ESCALATED_FENCE)).toBe(true);
  });

  it('recognizes an intentionally empty new-format Roadmap.md by its structural headings (GAP-28 BUG-02)', () => {
    const emptyNewFormat =
      '# Roadmap\n\n## Plan\n\nNo entries yet.\n\n## Cross-cutting\n\nNo entries yet.\n';
    expect(looksLikeNewFormatRoadmap(emptyNewFormat)).toBe(true);
    // Without a real entry, this must still parse to zero rows, not throw.
    expect(extractRoadmapYamlEntries(emptyNewFormat)).toEqual([]);
  });
});

describe('extractRoadmapYamlEntries', () => {
  it('parses every entry with its id, type, and full data block', () => {
    const entries = extractRoadmapYamlEntries(NEW_FORMAT);
    expect(entries.map((e) => e.id)).toEqual(['EPIC-03', 'TASK-42', 'TASK-43']);
    expect(entries[1].type).toBe('TASK');
    expect(entries[1].data.assigned_agent).toBe('claude');
  });

  it('throws on an unterminated yaml fence instead of silently returning nothing', () => {
    const broken = `### TASK-1 — Broken\n\n\`\`\`yaml\nid: TASK-1\ntype: TASK\nstatus: BACKLOG\n`;
    expect(() => extractRoadmapYamlEntries(broken)).toThrow(/unterminated/);
  });

  it('throws on invalid YAML inside a fence', () => {
    const broken = `### TASK-1 — Broken\n\n\`\`\`yaml\nid: TASK-1\n  type: [unclosed\n\`\`\`\n`;
    expect(() => extractRoadmapYamlEntries(broken)).toThrow();
  });

  it('throws when a required field is missing', () => {
    const missingType = `### TASK-1 — Broken\n\n\`\`\`yaml\nid: TASK-1\nstatus: BACKLOG\n\`\`\`\n`;
    expect(() => extractRoadmapYamlEntries(missingType)).toThrow(/type/);
  });

  it('parses a 4-backtick-fenced entry whose body has an embedded 3-backtick line, without truncating it early', () => {
    const entries = extractRoadmapYamlEntries(ESCALATED_FENCE);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('BUG-99');
    // If the closing-fence scan stopped at the embedded 3-backtick run
    // instead of requiring 4+, the YAML would be truncated before this
    // field and parsing would either throw or omit it.
    expect(entries[0].data.next_action).toBe(
      'value after the embedded backticks',
    );
  });
});

// The real failure behind Roadmap BUG-05: one unquoted `: ` in a title made
// F1-T104's YAML invalid, and every sync of the project failed for it.
const ONE_BROKEN_ENTRY = `# Roadmap

## Plan

### TASK-1 — Fine before

\`\`\`yaml
id: TASK-1
type: TASK
title: Fine before
status: BACKLOG
\`\`\`

### F1-T104 — Contradicción SuperAdmin

\`\`\`yaml
id: F1-T104
type: TASK
title: Contradicción SuperAdmin: código vs. spec
status: READY
\`\`\`

### TASK-3 — Fine after

\`\`\`yaml
id: TASK-3
type: TASK
title: Fine after
status: BACKLOG
\`\`\`
`;

describe('extractRoadmapYamlEntriesTolerant (Roadmap BUG-05)', () => {
  it('isolates one invalid entry: the others are still returned', () => {
    const { entries, errors } =
      extractRoadmapYamlEntriesTolerant(ONE_BROKEN_ENTRY);

    expect(entries.map((e) => e.id)).toEqual(['TASK-1', 'TASK-3']);
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe('F1-T104');
  });

  it('locates the failure in the file and explains it in one readable line', () => {
    const [error] = extractRoadmapYamlEntriesTolerant(ONE_BROKEN_ENTRY).errors;
    const lines = ONE_BROKEN_ENTRY.split('\n');

    // 1-based line of the offending `title:` line itself.
    expect(lines[error.line - 1]).toContain('title: Contradicción SuperAdmin:');
    expect(error.reason).not.toContain('\n');
    expect(error.reason).toMatch(/Nested mappings are not allowed/);
    expect(error.reason).toMatch(/quote a value that contains/);
    // Block-relative "at line N, column M" would mislead against a file line.
    expect(error.reason).not.toMatch(/at line \d+/);
  });

  it('reports a block that is not a mapping, and a missing required field', () => {
    const md = [
      '### TASK-1 — List',
      '',
      '```yaml',
      '- just',
      '- a list',
      '```',
      '',
      '### TASK-2 — No status',
      '',
      '```yaml',
      'id: TASK-2',
      'type: TASK',
      '```',
      '',
    ].join('\n');

    const { entries, errors } = extractRoadmapYamlEntriesTolerant(md);

    expect(entries).toEqual([]);
    expect(errors.map((e) => [e.id, e.reason])).toEqual([
      ['TASK-1', 'the yaml block must be a mapping'],
      [
        'TASK-2',
        'missing a required "status" field (it must be a non-empty string)',
      ],
    ]);
  });

  it('still throws when the whole document is malformed (unterminated fence)', () => {
    const broken = `### TASK-1 — Broken\n\n\`\`\`yaml\nid: TASK-1\ntype: TASK\nstatus: BACKLOG\n`;
    expect(() => extractRoadmapYamlEntriesTolerant(broken)).toThrow(
      RoadmapFormatError,
    );
  });

  it('keeps the strict form all-or-nothing, with the entry named in its message', () => {
    expect(() => extractRoadmapYamlEntries(ONE_BROKEN_ENTRY)).toThrow(
      /invalid YAML in entry "F1-T104"/,
    );
  });
});

describe('extractRoadmapYamlEntriesForWrite (Roadmap BUG-05)', () => {
  it('lets a write to a readable entry go ahead despite a broken sibling', () => {
    const entries = extractRoadmapYamlEntriesForWrite(
      ONE_BROKEN_ENTRY,
      'TASK-3',
    );
    expect(entries.map((e) => e.id)).toEqual(['TASK-1', 'TASK-3']);
  });

  it('refuses a write to the unreadable entry itself — never lets an upsert append a duplicate', () => {
    expect(() =>
      extractRoadmapYamlEntriesForWrite(ONE_BROKEN_ENTRY, 'F1-T104'),
    ).toThrow(RoadmapFormatError);
    expect(() => removeRoadmapYamlEntry(ONE_BROKEN_ENTRY, 'F1-T104')).toThrow(
      RoadmapFormatError,
    );
  });
});

describe('status vocabulary translation', () => {
  it('maps every base TaskStatus to a new-format status and back', () => {
    for (const status of Object.values(TaskStatus)) {
      const newStatus = mapTaskStatusToNewStatus(status);
      expect(mapNewStatusToTaskStatus(newStatus)).toBe(status);
    }
  });

  it('leaves a new-format state with no Kanban equivalent unmapped rather than guessing', () => {
    expect(mapNewStatusToTaskStatus('DEFERRED')).toBeNull();
    expect(mapNewStatusToTaskStatus('IDEA')).toBeNull();
    expect(mapNewStatusToTaskStatus('REVIEW')).toBeNull();
    expect(mapNewStatusToTaskStatus('CANCELLED')).toBeNull();
  });
});

describe('roadmapYamlEntryToRow', () => {
  it('maps an in-progress entry to an ACTIVE row with translated status and flattened acceptance criteria', () => {
    const [, task42] = extractRoadmapYamlEntries(NEW_FORMAT);
    const row = roadmapYamlEntryToRow(task42);
    expect(row.table).toBe(RoadmapTable.ACTIVE);
    expect(row.statusMapped).toBe(TaskStatus.EN_DESARROLLO);
    expect(row.outcome).toBe('Add sync-strategy selector');
    expect(row.acceptanceCheck).toBe(
      '[AC-1] The form shows a strategy selector.; [AC-2] The chosen strategy is persisted.',
    );
    expect(row.dependsOnRaw).toBe('TASK-31');
    expect(row.ownerName).toBe('claude');
    expect(row.ownerClaimedAt).toBe('2026-09-17T10:00:00.000Z');
  });

  it('maps a BLOCKED entry to a BLOCKED row, never assigning a fabricated status', () => {
    const [, , task43] = extractRoadmapYamlEntries(NEW_FORMAT);
    const row = roadmapYamlEntryToRow(task43);
    expect(row.table).toBe(RoadmapTable.BLOCKED);
    expect(row.blocker).toBe('DEC-007');
    expect(row.statusMapped).toBeUndefined();
    expect(row.ownerName).toBe('Cristian');
  });
});

describe('roadmapYamlEntryToRow owner kind (Roadmap GAP-35a)', () => {
  const rowOf = (lines: string[]) => {
    const markdown = [
      '### T-1 — Entry',
      '',
      '```yaml',
      'id: T-1',
      'type: TASK',
      'status: READY',
      ...lines,
      '```',
      '',
    ].join('\n');
    return roadmapYamlEntryToRow(extractRoadmapYamlEntries(markdown)[0]);
  };

  it('reads an agent from executor: AI + assigned_agent, ahead of the accountable owner', () => {
    expect(
      rowOf([
        'executor: AI',
        'assigned_agent: claude',
        'owner:',
        '  type: HUMAN',
        '  name: Cristian',
      ]),
    ).toMatchObject({ ownerName: 'claude', ownerKind: 'AI_AGENT' });
  });

  it('reads the kind of a plain owner from its type, and leaves it open when there is none', () => {
    expect(rowOf(['owner:', '  type: HUMAN', '  name: Ana'])).toMatchObject({
      ownerName: 'Ana',
      ownerKind: 'HUMAN',
    });
    expect(rowOf(['owner:', '  type: AI', '  name: Bot'])).toMatchObject({
      ownerKind: 'AI_AGENT',
    });
    const untyped = rowOf(['owner:', '  name: Ana']);
    expect(untyped.ownerName).toBe('Ana');
    expect(untyped.ownerKind).toBeUndefined();
  });
});

describe('duplicate ids, blocked titles and unrecognized statuses (Roadmap GAP-35b)', () => {
  const entry = (
    id: string,
    title: string,
    status = 'READY',
    extra: string[] = [],
  ) =>
    [
      `### ${id} — X`,
      '',
      '```yaml',
      `id: ${id}`,
      'type: TASK',
      `title: ${title}`,
      `status: ${status}`,
      ...extra,
      '```',
      '',
    ].join('\n');

  it('imports none of the copies of a duplicated id, and reports each one naming the others', () => {
    const md = [
      '## Plan',
      '',
      entry('T-1', 'First'),
      entry('T-2', 'Only'),
      entry('T-1', 'Second copy'),
    ].join('\n');

    const { entries, errors } = extractRoadmapYamlEntriesTolerant(md);

    expect(entries.map((e) => e.id)).toEqual(['T-2']);
    const lines = md.split('\n');
    const first = lines.indexOf('### T-1 — X') + 1;
    const second = lines.lastIndexOf('### T-1 — X') + 1;
    expect(errors.map((e) => [e.id, e.line])).toEqual([
      ['T-1', first],
      ['T-1', second],
    ]);
    expect(errors[0].reason).toBe(
      `duplicate id, also defined at line ${second}`,
    );
    expect(errors[1].reason).toBe(
      `duplicate id, also defined at line ${first}`,
    );
    // Strict readers refuse it, and a write to that id is refused too.
    expect(() => extractRoadmapYamlEntries(md)).toThrow(
      /defined more than once/,
    );
    expect(() => extractRoadmapYamlEntriesForWrite(md, 'T-1')).toThrow(
      RoadmapFormatError,
    );
    expect(extractRoadmapYamlEntriesForWrite(md, 'T-2')).toHaveLength(1);
  });

  it('keeps the title of a BLOCKED entry', () => {
    const [blocked] = extractRoadmapYamlEntries(
      entry('T-1', 'Waiting on legal', 'BLOCKED', ['blocked_by:', '  - DEC-7']),
    );
    const row = roadmapYamlEntryToRow(blocked);

    expect(row.table).toBe(RoadmapTable.BLOCKED);
    expect(row.outcome).toBe('Waiting on legal');
    expect(row.blocker).toBe('DEC-7');
  });

  it('flags a status outside the document vocabulary, but not a valid state with no Kanban column', () => {
    const rowOf = (status: string) =>
      roadmapYamlEntryToRow(
        extractRoadmapYamlEntries(entry('T-1', 'X', status))[0],
      );

    expect(rowOf('WIP')).toMatchObject({
      statusMapped: null,
      statusUnrecognized: true,
    });
    for (const valid of ['IDEA', 'REVIEW', 'CANCELLED', 'DEFERRED']) {
      const row = rowOf(valid);
      expect(row.statusMapped).toBeNull();
      expect(row.statusUnrecognized).toBeUndefined();
    }
    expect(rowOf('in_progress').statusUnrecognized).toBeUndefined();
  });
});
