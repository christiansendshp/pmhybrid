import { createHash } from 'node:crypto';
import type { ParsedRoadmapRow } from '../roadmap/roadmap-parser.service.js';

/**
 * Fingerprint of everything a Roadmap row carries. Stored on Task as
 * `lastSyncedContentHash` — the last known external version of that row —
 * so sync can tell a genuine document-side change apart from a local edit
 * (brief §26). Shared by the read path and write-back.
 */
export function rowContentHash(row: ParsedRoadmapRow): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        row.externalId,
        row.table,
        row.outcome,
        row.acceptanceCheck,
        row.statusRaw,
        row.rawOwner,
        row.dependsOnRaw,
        row.blocker,
        row.neededDecision,
      ]),
    )
    .digest('hex');
}
