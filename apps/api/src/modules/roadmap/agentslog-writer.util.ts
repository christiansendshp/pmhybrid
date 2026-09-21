import { detectLineEnding } from './line-ending.util.js';
import { sanitizeField } from './roadmap-row-writer.util.js';

export interface AgentslogEntryInput {
  timestampIso: string;
  agentName: string;
  taskExternalId: string;
  statusWord: string;
  summary: string;
  files: string;
  verify: string;
  /** Old-format bullet; omit to write a skill-v2-shaped entry (that format has no Follow-up bullet at all). */
  followUp?: string;
  /** Skill v2's "CATEGORY - detail" bullet, required for a PAUSE entry (references/workflow.md); omit otherwise. */
  pause?: string;
}

/**
 * Appends one entry to the end of Agentslog.md. Always writes Summary/Files/
 * Verify; Follow-up and Pause are each written only when provided, so a
 * caller can produce either the old fixed four-bullet shape (pass
 * `followUp`, as write-back.service.ts still does) or the skill v2 shape
 * (pass `pause` for a PAUSE entry, omit both for anything else). Append-only
 * — an existing entry is never rewritten, matching the ledger's own
 * append-only contract.
 */
export function appendAgentslogEntry(
  markdown: string,
  entry: AgentslogEntryInput,
): string {
  const lines = [
    `## [${entry.timestampIso}] | ${sanitizeField(entry.agentName)} | ${sanitizeField(entry.taskExternalId)} | ${sanitizeField(entry.statusWord)}`,
    '',
    `- Summary: ${sanitizeField(entry.summary)}`,
    `- Files: ${sanitizeField(entry.files)}`,
    `- Verify: ${sanitizeField(entry.verify)}`,
  ];
  if (entry.followUp !== undefined) {
    lines.push(`- Follow-up: ${sanitizeField(entry.followUp)}`);
  }
  if (entry.pause !== undefined) {
    lines.push(`- Pause: ${sanitizeField(entry.pause)}`);
  }

  const eol = detectLineEnding(markdown);
  const trimmed = markdown.replace(/\s+$/, '');
  return `${trimmed}${eol}${eol}${lines.join(eol)}${eol}`;
}
