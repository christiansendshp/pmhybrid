import { createHash } from 'node:crypto';
import type { ParsedRoadmapRow } from '../roadmap/roadmap-parser.service.js';

/**
 * Fingerprint of everything a Roadmap row carries. Stored on Task as
 * `lastSyncedContentHash` — the last known external version of that row —
 * so sync can tell a genuine document-side change apart from a local edit
 * (brief §26). Shared by the read path and write-back.
 */
export function rowContentHash(row: ParsedRoadmapRow): string {
  const carried = [
    row.externalId,
    row.table,
    row.outcome,
    row.acceptanceCheck,
    row.statusRaw,
    row.rawOwner,
    row.dependsOnRaw,
    row.blocker,
    row.neededDecision,
  ];
  // The attributes of an entry (type, priority, progress) count as part of it,
  // so a document edit that changes only one of them is seen. A table row has
  // none, and is fingerprinted exactly as before they existed — its stored
  // hash stays valid instead of every row being read again once.
  const attributes =
    row.entryType === undefined &&
    row.priority === undefined &&
    row.progress === undefined
      ? []
      : [row.entryType, row.priority, row.progress];
  return createHash('sha256')
    .update(JSON.stringify([...carried, ...attributes]))
    .digest('hex');
}
