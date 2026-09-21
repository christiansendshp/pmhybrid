import { describe, expect, it } from 'vitest';
import { RoadmapTable, TaskStatus } from '@pmhybrid/shared-types';
import {
  RoadmapParserService,
  rowCarriesDependsOn,
} from './roadmap-parser.service.js';
import { SKILL_ROADMAP } from './skill-format.fixtures.js';

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

describe('RoadmapParserService latest skill tables (Roadmap GAP-37a)', () => {
  const parser = new RoadmapParserService();
  const { rows, errors } = parser.parseTolerant(SKILL_ROADMAP);
  const row = (id: string) =>
    rows.find((candidate) => candidate.externalId === id)!;

  it('reads every row of every table — Active work, Near term, Plan and Gaps — with no error', () => {
    expect(errors).toEqual([]);
    expect(rows.map((candidate) => candidate.externalId)).toEqual([
      'F01-E01-T01',
      'F01-E01-T02',
      'F01-E01-T03',
      'F01-E01-T04',
      'F02-E01-T01',
      'F01-E01-T05',
      'F01-E01-T06',
      'F01-BUG-01',
      'F01-DEBT-01',
    ]);
    expect(row('F02-E01-T01').table).toBe(RoadmapTable.NEAR_TERM);
    expect(row('F01-E01-T05').table).toBe(RoadmapTable.ACTIVE);
    expect(row('F01-BUG-01').table).toBe(RoadmapTable.ACTIVE);
  });

  it('maps the workflow statuses and treats PAUSE as a valid state with no Kanban column', () => {
    expect(row('F01-E01-T01')).toMatchObject({
      statusMapped: TaskStatus.EN_DESARROLLO,
    });
    expect(row('F01-E01-T05')).toMatchObject({
      statusMapped: TaskStatus.PENDIENTE,
    });
    for (const id of ['F01-E01-T02', 'F01-E01-T03', 'F01-E01-T04']) {
      expect(row(id).statusRaw).toBe('PAUSE');
      expect(row(id).statusMapped).toBeNull();
      expect(row(id).statusUnrecognized).toBeUndefined();
    }
  });

  it('reads a blocking pause (BLOQUEO, ESPERA_RESPUESTA) as blocked, keeping the reason and the dependencies', () => {
    expect(row('F01-E01-T02')).toMatchObject({
      table: RoadmapTable.BLOCKED,
      blocker: 'BLOQUEO - waiting for the schema review',
      pauseReason: 'BLOQUEO - waiting for the schema review',
      dependsOnRaw: 'F01-E01-T01',
    });
    expect(row('F01-E01-T02').outcome).toBe('Wire the exporter');
    expect(rowCarriesDependsOn(row('F01-E01-T02'))).toBe(true);
    expect(row('F01-E01-T04')).toMatchObject({
      table: RoadmapTable.BLOCKED,
      blocker: 'ESPERA_RESPUESTA - the product owner has to choose',
    });
  });

  it('does not read a plain stop (LIMITE) as blocked', () => {
    expect(row('F01-E01-T03')).toMatchObject({
      table: RoadmapTable.ACTIVE,
      pauseReason: 'LIMITE - usage limit reached',
    });
    expect(row('F01-E01-T03').blocker).toBeUndefined();
  });

  it('ignores a Pause reason left on a row that is not paused', () => {
    const stale = SKILL_ROADMAP.replace(
      '| IN_PROGRESS | claude@2026-09-21T10:00:00Z | — | — |',
      '| IN_PROGRESS | claude@2026-09-21T10:00:00Z | — | BLOQUEO - old |',
    );
    const resumed = parser
      .parseTolerant(stale)
      .rows.find((candidate) => candidate.externalId === 'F01-E01-T01')!;

    expect(resumed.table).toBe(RoadmapTable.ACTIVE);
    expect(resumed.pauseReason).toBeUndefined();
    expect(resumed.blocker).toBeUndefined();
  });

  it('uses the Gaps Description as the row text, and reads its owner and dependencies', () => {
    expect(row('F01-BUG-01').outcome).toBe(
      'The importer drops the last row of a file without a trailing newline',
    );
    expect(row('F01-DEBT-01')).toMatchObject({
      statusMapped: TaskStatus.EN_DESARROLLO,
      ownerName: 'claude',
      dependsOnRaw: 'F01-BUG-01',
    });
  });

  it('reads the owner claim of a skill row as a name and a timestamp', () => {
    expect(row('F01-E01-T01')).toMatchObject({
      ownerName: 'claude',
      ownerClaimedAt: '2026-09-21T10:00:00.000Z',
    });
  });

  it('reads the skill template itself: empty placeholder rows are skipped, not read as tasks', () => {
    const template = [
      '## Active work',
      '',
      '| ID | Outcome | Acceptance check | Status | Owner | Depends on | Pause reason |',
      '|---|---|---|---|---|---|---|',
      '| — | — | — | — | — | — | — |',
      '',
      '## Gaps, Bugs & Technical Debt',
      '',
      '| ID | Severity | Phase | Description | Status | Owner | Depends on | Pause reason |',
      '|---|---|---|---|---|---|---|---|',
      '| — | — | — | — | — | — | — | — |',
      '',
    ].join('\n');

    expect(parser.parseTolerant(template)).toEqual({ rows: [], errors: [] });
  });
});
