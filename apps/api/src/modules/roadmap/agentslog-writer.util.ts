import { sanitizeField } from './roadmap-row-writer.util.js';

export interface AgentslogEntryInput {
  timestampIso: string;
  agentName: string;
  taskExternalId: string;
  statusWord: string;
  summary: string;
  files: string;
  verify: string;
  followUp: string;
}

/**
 * Appends one entry to the end of Agentslog.md, matching the skill's fixed
 * format exactly (docs/roadmap-parser.md). Append-only — an existing entry
 * is never rewritten, matching the ledger's own append-only contract.
 */
export function appendAgentslogEntry(
  markdown: string,
  entry: AgentslogEntryInput,
): string {
  const block = [
    `## [${entry.timestampIso}] | ${sanitizeField(entry.agentName)} | ${sanitizeField(entry.taskExternalId)} | ${sanitizeField(entry.statusWord)}`,
    '',
    `- Summary: ${sanitizeField(entry.summary)}`,
    `- Files: ${sanitizeField(entry.files)}`,
    `- Verify: ${sanitizeField(entry.verify)}`,
    `- Follow-up: ${sanitizeField(entry.followUp)}`,
  ].join('\n');

  const trimmed = markdown.replace(/\s+$/, '');
  return `${trimmed}\n\n${block}\n`;
}
