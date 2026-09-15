import type { AuditEvent } from './audit.service.js';

export interface AuditFieldChange {
  field: string;
  from: string;
  to: string;
}

/**
 * One entry per touched field — newValue's keys first, then keys that only
 * exist in previousValue — for rendering "valor anterior → valor nuevo"
 * (brief §25).
 */
export function describeAuditChanges(
  event: Pick<AuditEvent, 'previousValue' | 'newValue'>,
): AuditFieldChange[] {
  const previous = event.previousValue ?? {};
  const next = event.newValue ?? {};
  const fields = [...new Set([...Object.keys(next), ...Object.keys(previous)])];
  return fields.map((field) => ({
    field,
    from: formatAuditValue(previous[field]),
    to: formatAuditValue(next[field]),
  }));
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
