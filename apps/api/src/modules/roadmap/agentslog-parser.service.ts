import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface ParsedAgentLogEntry {
  timestampFromLog: string; // ISO-8601, as written — never trusted for ordering (docs/roadmap-parser.md)
  agentName: string;
  taskExternalId: string;
  statusWord: string;
  summary: string;
  /** '' when the bullet is absent (project-documentation skill v2's format omits Files when there's nothing to name). */
  files: string;
  /** '' when the bullet is absent (skill v2 only requires it for a DONE entry). */
  verify: string;
  /** '' when the bullet is absent — skill v2's format has no Follow-up bullet at all; only the old (pre-v2) format writes one. */
  followUp: string;
  /** "CATEGORY - detail"; only present on a skill v2 PAUSE entry. Not yet persisted by AgentslogIngestionService (no DB column) — surfaced here so a caller can use it without another parser change. */
  pause?: string;
  rawEntryHash: string;
}

export interface PreviousSegmentPointer {
  archivePath: string;
  sha256: string;
}

export interface ParsedAgentslog {
  entries: ParsedAgentLogEntry[];
  previousSegment?: PreviousSegmentPointer;
}

const ENTRY_HEADER = /^## \[(.+?)\] \| (.+?) \| (.+?) \| (.+)$/;
const BULLET = /^- (Summary|Files|Verify|Follow-up|Pause): (.*)$/;

/**
 * Parses Agentslog.md's entry format, accepting both the pre-v2 shape
 * (Summary/Files/Verify/Follow-up, all four always present — still what
 * write-back.service.ts emits) and the project-documentation skill v2 shape
 * (Summary required, Files optional, Verify required only for DONE, Pause
 * required only for PAUSE, no Follow-up bullet at all). An entry is accepted
 * once it has a Summary bullet; whichever of the other four bullets follow
 * are captured, in any subset. Read-only — does not follow the "## Previous
 * segment" rotation pointer into docs/history/ itself (that ingestion
 * belongs to the full reconciliation in FASE-08); it only surfaces the
 * pointer so a caller can decide to fetch it.
 */
@Injectable()
export class AgentslogParserService {
  parse(rawMarkdown: string): ParsedAgentslog {
    const lines = rawMarkdown.split(/\r?\n/);
    const entries: ParsedAgentLogEntry[] = [];
    let previousSegment: PreviousSegmentPointer | undefined;

    let i = 0;
    let inFence = false;
    while (i < lines.length) {
      const line = lines[i];

      // The skill's own docs show the entry format as a fenced example
      // (```markdown ... ```) inside Agentslog.md itself — never parse
      // inside a code fence as a real entry.
      if (line.trim().startsWith('```')) {
        inFence = !inFence;
        i += 1;
        continue;
      }
      if (inFence) {
        i += 1;
        continue;
      }

      if (line.trim() === '## Previous segment') {
        const block = lines.slice(i + 1, i + 6).join('\n');
        const archiveMatch = block.match(/- Archive: `([^`]+)`/);
        const hashMatch = block.match(/- SHA-256: `([^`]+)`/);
        if (archiveMatch && hashMatch) {
          previousSegment = {
            archivePath: archiveMatch[1],
            sha256: hashMatch[1],
          };
        }
        i += 1;
        continue;
      }

      const headerMatch = line.match(ENTRY_HEADER);
      if (!headerMatch) {
        i += 1;
        continue;
      }

      const [, timestampFromLog, agentName, taskExternalId, statusWord] =
        headerMatch;
      const bullets: Record<string, string> = {};
      const entryLines = [line];
      let j = i + 1;

      // Skip a single optional blank line between the header and the bullets.
      if (j < lines.length && lines[j].trim() === '') {
        j += 1;
      }

      // A bullet name repeating (rather than an unrecognized line) also ends
      // the block — each bullet appears at most once per entry, so a repeat
      // means we've run past this entry's fields (e.g. into the next
      // malformed/hand-edited one) rather than that more of them remain.
      while (j < lines.length) {
        const bulletMatch = lines[j].match(BULLET);
        if (!bulletMatch || bullets[bulletMatch[1]] !== undefined) {
          break;
        }
        bullets[bulletMatch[1]] = bulletMatch[2];
        entryLines.push(lines[j]);
        j += 1;
      }

      if (bullets['Summary'] !== undefined) {
        entries.push({
          timestampFromLog,
          agentName,
          taskExternalId,
          statusWord,
          summary: bullets['Summary'],
          files: bullets['Files'] ?? '',
          verify: bullets['Verify'] ?? '',
          followUp: bullets['Follow-up'] ?? '',
          pause: bullets['Pause'],
          rawEntryHash: createHash('sha256')
            .update(entryLines.join('\n'))
            .digest('hex'),
        });
      }

      i = j;
    }

    return { entries, previousSegment };
  }
}
