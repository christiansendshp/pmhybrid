import { describe, expect, it } from 'vitest';
import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import { RoadmapParserService } from './roadmap-parser.service.js';

const SAMPLE = `# Roadmap

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on |
|---|---|---|---|---|---|
| F01-S01-T01 | Ship the widget | it ships | EN DESARROLLO | claude@2026-09-14T10:00:00Z | F01-S01-T00 |
| F01-S01-T02 | Unknown token | check | SOMETHING_WEIRD | — | — |

<!-- context:end -->

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
|---|---|---|---|---|
| F01-S01-T03 | Later work | later check | TODO | — |

## Blocked

| ID | Blocker | Needed decision or event | Owner |
|---|---|---|---|
| F01-S01-T04 | waiting on legal | need sign-off | ana |
| — | — | — | — |
`;

describe('RoadmapParserService', () => {
  const parser = new RoadmapParserService();

  it('discriminates the three tables by column signature and skips placeholder rows', () => {
    const rows = parser.parse(SAMPLE);
    expect(rows.map((r) => r.table)).toEqual([
      RoadmapTable.ACTIVE,
      RoadmapTable.ACTIVE,
      RoadmapTable.NEAR_TERM,
      RoadmapTable.BLOCKED,
    ]);
  });

  it('maps a verbatim app status identically (round-trip) and parses the owner claim', () => {
    const [row] = parser.parse(SAMPLE);
    expect(row.statusMapped).toBe(TaskStatus.EN_DESARROLLO);
    expect(row.ownerName).toBe('claude');
    expect(row.ownerClaimedAt).toBe('2026-09-14T10:00:00.000Z');
    expect(row.rawOwner).toBe('claude@2026-09-14T10:00:00Z');
  });

  it('leaves statusMapped null for an unrecognized token instead of defaulting to PENDIENTE', () => {
    const rows = parser.parse(SAMPLE);
    const unknown = rows.find((r) => r.externalId === 'F01-S01-T02')!;
    expect(unknown.statusMapped).toBeNull();
    expect(unknown.statusRaw).toBe('SOMETHING_WEIRD');
  });

  it('parses Blocked rows into blocker/neededDecision, not status/dependsOn', () => {
    const rows = parser.parse(SAMPLE);
    const blocked = rows.find((r) => r.externalId === 'F01-S01-T04')!;
    expect(blocked.blocker).toBe('waiting on legal');
    expect(blocked.neededDecision).toBe('need sign-off');
    expect(blocked.statusRaw).toBeUndefined();
    expect(blocked.dependsOnRaw).toBeUndefined();
  });
});

describe('RoadmapParserService tolerant read (Roadmap BUG-05)', () => {
  const parser = new RoadmapParserService();
  const entry = (id: string, title: string) =>
    [
      `### ${id} — Entry`,
      '',
      '```yaml',
      `id: ${id}`,
      'type: TASK',
      `title: ${title}`,
      'status: READY',
      '```',
      '',
    ].join('\n');
  const withBroken = [
    '# Roadmap',
    '',
    '## Plan',
    '',
    entry('TASK-1', 'Readable'),
    entry('TASK-2', 'Broken: because of this colon'),
    entry('TASK-3', 'Also readable'),
  ].join('\n');

  it('returns the readable rows and lists the unreadable entry apart', () => {
    const { rows, errors } = parser.parseTolerant(withBroken);

    expect(rows.map((row) => row.externalId)).toEqual(['TASK-1', 'TASK-3']);
    expect(errors.map((error) => error.id)).toEqual(['TASK-2']);
  });

  it('keeps parse() strict: it never hands back a silently-shortened list', () => {
    expect(() => parser.parse(withBroken)).toThrow(/entry "TASK-2"/);
  });

  it('reads an old-format table document with no entry errors', () => {
    const { rows, errors } = parser.parseTolerant(SAMPLE);

    expect(rows.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

describe('RoadmapParserService old-format duplicates and statuses (Roadmap GAP-35b)', () => {
  const parser = new RoadmapParserService();
  const doc = [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '|---|---|---|---|---|---|',
    '| A-1 | First | c | TODO | — | — |',
    '| A-2 | Twice | c | TODO | — | — |',
    '| A-3 | Odd status | c | WIP | — | — |',
    '',
    '## Near term',
    '',
    '| ID | Outcome | Acceptance check | Status | Depends on |',
    '|---|---|---|---|---|',
    '| A-2 | Twice, again | c | TODO | — |',
    '',
  ].join('\n');

  it('imports none of the rows of a duplicated id, across tables too, and names their lines', () => {
    const { rows, errors } = parser.parseTolerant(doc);

    expect(rows.map((row) => row.externalId)).toEqual(['A-1', 'A-3']);
    expect(errors.map((error) => [error.id, error.line])).toEqual([
      ['A-2', 8],
      ['A-2', 15],
    ]);
    expect(errors[0].reason).toBe('duplicate id, also defined at line 15');
    expect(() => parser.parse(doc)).toThrow(/defined more than once/);
  });

  it('flags a token that maps to no status', () => {
    const odd = parser
      .parseTolerant(doc)
      .rows.find((row) => row.externalId === 'A-3')!;

    expect(odd).toMatchObject({ statusMapped: null, statusUnrecognized: true });
  });
});
