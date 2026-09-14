import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface ParsedAgentLogEntry {
  timestampFromLog: string; // ISO-8601, as written — never trusted for ordering (docs/roadmap-parser.md)
  agentName: string;
  taskExternalId: string;
  statusWord: string;
  summary: string;
  files: string;
  verify: string;
  followUp: string;
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
const BULLET = /^- (Summary|Files|Verify|Follow-up): (.*)$/;

/**
 * Parses Agentslog.md's fixed entry format (docs/roadmap-parser.md,
 * docs/skillProyectDocument-analysis.md §7). Read-only — does not follow
 * the "## Previous segment" rotation pointer into docs/history/ itself
 * (that ingestion belongs to the full reconciliation in FASE-08); it only
 * surfaces the pointer so a caller can decide to fetch it.
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

      while (j < lines.length && bullets['Follow-up'] === undefined) {
        const bulletMatch = lines[j].match(BULLET);
        if (!bulletMatch) {
          break;
        }
        bullets[bulletMatch[1]] = bulletMatch[2];
        entryLines.push(lines[j]);
        j += 1;
      }

      if (
        bullets['Summary'] !== undefined &&
        bullets['Files'] !== undefined &&
        bullets['Verify'] !== undefined &&
        bullets['Follow-up'] !== undefined
      ) {
        entries.push({
          timestampFromLog,
          agentName,
          taskExternalId,
          statusWord,
          summary: bullets['Summary'],
          files: bullets['Files'],
          verify: bullets['Verify'],
          followUp: bullets['Follow-up'],
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
