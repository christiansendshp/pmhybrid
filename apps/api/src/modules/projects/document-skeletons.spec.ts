import { describe, expect, it } from 'vitest';
import { isSkillRoadmap } from '../roadmap/markdown-table.util.js';
import { AgentslogParserService } from '../roadmap/agentslog-parser.service.js';
import { RoadmapParserService } from '../roadmap/roadmap-parser.service.js';
import { upsertLifecycleRoadmapRow } from '../roadmap/roadmap-row-writer.util.js';
import { appendAgentslogEntry } from '../roadmap/agentslog-writer.util.js';
import {
  AGENTSLOG_SKELETON,
  DOCUMENT_SKELETONS,
  ROADMAP_SKELETON,
} from './document-skeletons.js';

describe('the documents a new project starts with (Roadmap GAP-36a)', () => {
  it('names exactly the two files PM Hub reads and writes', () => {
    expect(Object.keys(DOCUMENT_SKELETONS).sort()).toEqual([
      'Agentslog.md',
      'Roadmap.md',
    ]);
  });

  it('is a Roadmap in the latest skill format that holds no task and reads without an error', () => {
    expect(isSkillRoadmap(ROADMAP_SKELETON)).toBe(true);

    expect(new RoadmapParserService().parseTolerant(ROADMAP_SKELETON)).toEqual({
      rows: [],
      errors: [],
      structure: [],
    });
  });

  it('has an Active work table for the first task created in the app to land in, written with the skill words', () => {
    const written = upsertLifecycleRoadmapRow(ROADMAP_SKELETON, 'PMH-1', {
      outcome: 'First task',
      acceptanceCheck: 'It works',
      status: 'PENDIENTE',
      owner: null,
      dependsOn: '—',
    });

    const rows = new RoadmapParserService().parse(written);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalId: 'PMH-1',
      statusRaw: 'TODO',
      table: 'ACTIVE',
    });
    // Written into Active work, before the Near term table.
    expect(written.indexOf('PMH-1')).toBeLessThan(
      written.indexOf('## Near term'),
    );
  });

  it('is a ledger with no entry, that an entry can be appended to and read back', () => {
    expect(
      new AgentslogParserService().parse(AGENTSLOG_SKELETON).entries,
    ).toEqual([]);

    const log = appendAgentslogEntry(AGENTSLOG_SKELETON, {
      timestampIso: '2026-09-21T10:00:00.000Z',
      agentName: 'claude',
      taskExternalId: 'PMH-1',
      statusWord: 'IN_PROGRESS',
      summary: 'Started',
      verify: 'pending',
    });

    expect(
      new AgentslogParserService()
        .parse(log)
        .entries.map((entry) => entry.taskExternalId),
    ).toEqual(['PMH-1']);
  });
});
