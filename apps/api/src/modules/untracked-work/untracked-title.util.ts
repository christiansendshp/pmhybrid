import { LIMITS } from '../../common/dto-limits.js';

/**
 * The title of a task imported from work the ledger closed (Roadmap TASK-34): what the closing entry says it
 * did, on one line and no longer than a title may be; the ID when it says nothing.
 */
export function titleOfClosedWork(externalId: string, summary: string): string {
  const line = summary.replace(/\s+/g, ' ').trim();
  if (line === '') {
    return externalId;
  }
  return line.length <= LIMITS.TITLE
    ? line
    : `${line.slice(0, LIMITS.TITLE - 1).trimEnd()}…`;
}
