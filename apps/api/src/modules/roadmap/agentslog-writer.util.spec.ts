import { describe, expect, it } from 'vitest';
import { AgentslogParserService } from './agentslog-parser.service.js';
import { appendAgentslogEntry } from './agentslog-writer.util.js';

const LOG = `# Agents log

## Entries

## [2026-01-01T00:00:00Z] | claude-code | PMH-1 | DONE

- Summary: first
- Files: a.ts
- Verify: ok
- Follow-up: none
`;

describe('appendAgentslogEntry', () => {
  it('appends a new entry that the parser can read back', () => {
    const updated = appendAgentslogEntry(LOG, {
      timestampIso: '2026-01-02T00:00:00Z',
      agentName: 'claude-code',
      taskExternalId: 'PMH-2',
      statusWord: 'EN_DESARROLLO',
      summary: 'started work',
      files: 'b.ts',
      verify: 'n/a',
      followUp: 'continue',
    });

    const parsed = new AgentslogParserService().parse(updated);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[1]).toMatchObject({
      taskExternalId: 'PMH-2',
      statusWord: 'EN_DESARROLLO',
      summary: 'started work',
    });
  });

  it('never rewrites an existing entry — append only', () => {
    const updated = appendAgentslogEntry(LOG, {
      timestampIso: '2026-01-02T00:00:00Z',
      agentName: 'claude-code',
      taskExternalId: 'PMH-2',
      statusWord: 'DONE',
      summary: 'x',
      files: 'x',
      verify: 'x',
      followUp: 'x',
    });
    expect(updated).toContain('- Summary: first');
  });
});
