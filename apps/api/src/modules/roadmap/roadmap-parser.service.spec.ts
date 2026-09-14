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
