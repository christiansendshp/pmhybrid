import { describe, expect, it } from 'vitest';
import { RoadmapTable, TaskPriority } from '@pmhybrid/shared-types';
import type { ParsedRoadmapRow } from '../roadmap/roadmap-parser.service.js';
import { rowContentHash } from './row-content-hash.util.js';

const tableRow: ParsedRoadmapRow = {
  externalId: 'PMH-1',
  table: RoadmapTable.ACTIVE,
  outcome: 'Ship it',
  acceptanceCheck: 'It ships',
  statusRaw: 'TODO',
  rawOwner: 'claude@2026-09-21T10:00:00Z',
  dependsOnRaw: 'PMH-0',
};

describe('rowContentHash', () => {
  it('is stable for a table row, which has no entry attributes', () => {
    expect(rowContentHash({ ...tableRow })).toBe(rowContentHash(tableRow));
    // Pinned: a table row was fingerprinted this way before the attributes
    // existed, and every stored hash of one must stay valid.
    expect(rowContentHash(tableRow)).toBe(
      'f16303a7a8907f361ca561f44a1ac90846f6afd38870e7495afc34bb028df97e',
    );
  });

  it('sees a change of only the type, only the priority or only the progress', () => {
    const entry = {
      ...tableRow,
      entryType: 'TASK',
      priority: TaskPriority.HIGH,
      progress: 40,
    };
    const hashes = new Set([
      rowContentHash(entry),
      rowContentHash({ ...entry, entryType: 'GAP' }),
      rowContentHash({ ...entry, priority: TaskPriority.LOW }),
      rowContentHash({ ...entry, progress: 41 }),
      rowContentHash({ ...entry, priority: undefined }),
      rowContentHash({ ...entry, progress: undefined }),
    ]);
    expect(hashes.size).toBe(6);
  });
});
