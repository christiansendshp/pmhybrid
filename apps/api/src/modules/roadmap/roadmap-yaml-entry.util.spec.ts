import { describe, expect, it } from 'vitest';
import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import {
  extractRoadmapYamlEntries,
  looksLikeNewFormatRoadmap,
  mapNewStatusToTaskStatus,
  mapTaskStatusToNewStatus,
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
