import { formatAuditValue } from './audit-format.js';
import type { Conflict } from './synchronization.service.js';

export type ConflictFieldStatus = 'changed' | 'local-only' | 'external-only';

export interface ConflictFieldDiff {
  field: string;
  local: string;
  external: string;
  /**
   * 'changed': both sides carry this field (the normal case — every field
   * the reconciler puts here was already found to differ). 'local-only' /
   * 'external-only': only one side carries it — always true for every field
   * of a ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG conflict, whose
   * externalVersion is null because the document row is simply gone; kept
   * as a general case since the two sides' key sets are not schema-enforced
   * to match (brief §26 "diferencias").
   */
  status: ConflictFieldStatus;
}

/**
 * Field-by-field diff between a conflict's local (app) and external
 * (document) versions, for brief §26's "diferencias" — CONCURRENT_FIELD_EDIT
 * and WRITE_BACK_COLLISION carry the same field names on both sides;
 * ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG has a null externalVersion, so
 * every field renders as local-only with no document value to compare.
 */
export function diffConflictVersions(
  conflict: Pick<Conflict, 'localVersion' | 'externalVersion'>,
): ConflictFieldDiff[] {
  const local = conflict.localVersion ?? {};
  const external = conflict.externalVersion;
  const fields = [...new Set([...Object.keys(local), ...Object.keys(external ?? {})])].sort();

  return fields.map((field) => {
    const hasLocal = field in local;
    const hasExternal = external !== null && field in external;
    const status: ConflictFieldStatus = !hasExternal
      ? 'local-only'
      : !hasLocal
        ? 'external-only'
        : 'changed';
    return {
      field,
      local: hasLocal ? formatAuditValue(local[field]) : '—',
      external: hasExternal ? formatAuditValue((external as Record<string, unknown>)[field]) : '—',
      status,
    };
  });
}

/** Fields a MANUAL_EDIT may prefill a form with — mirrors the API's own
 * whitelist (apps/api/.../conflicts.service.ts EDITABLE_FIELD_VALIDATORS):
 * only these contested-field names are ever editable, so a form only offers
 * a field when it's both contested and in this set. */
const EDITABLE_FIELDS = new Set([
  'title',
  'acceptanceCriteria',
  'status',
  'rawOwner',
  'roadmapTable',
]);

export function isFieldEditable(field: string): boolean {
  return EDITABLE_FIELDS.has(field);
}
