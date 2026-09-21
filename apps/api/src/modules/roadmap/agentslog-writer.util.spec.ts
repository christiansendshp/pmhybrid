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

  it('writes a Pause bullet and no Follow-up when pause is given instead of followUp', () => {
    const updated = appendAgentslogEntry(LOG, {
      timestampIso: '2026-01-02T00:00:00Z',
      agentName: 'claude-code',
      taskExternalId: 'PMH-2',
      statusWord: 'PAUSE',
      summary: 'blocked',
      files: '',
      verify: '',
      pause: 'BLOQUEO - waiting on DEC-007',
    });

    expect(updated).toContain('- Pause: BLOQUEO - waiting on DEC-007');
    const newBlock = updated.slice(updated.indexOf('PMH-2'));
    expect(newBlock).not.toContain('Follow-up');

    const parsed = new AgentslogParserService().parse(updated);
    expect(parsed.entries[1]).toMatchObject({
      taskExternalId: 'PMH-2',
      statusWord: 'PAUSE',
      pause: 'BLOQUEO - waiting on DEC-007',
    });
  });

  it('writes neither Follow-up nor Pause when neither is given', () => {
    const updated = appendAgentslogEntry(LOG, {
      timestampIso: '2026-01-02T00:00:00Z',
      agentName: 'claude-code',
      taskExternalId: 'PMH-2',
      statusWord: 'IN_PROGRESS',
      summary: 'started',
      files: '',
      verify: '',
    });

    const newBlock = updated.slice(updated.indexOf('PMH-2'));
    expect(newBlock).not.toContain('Follow-up');
    expect(newBlock).not.toContain('Pause');
    const parsed = new AgentslogParserService().parse(updated);
    expect(parsed.entries[1].summary).toBe('started');
  });
});

describe('appendAgentslogEntry line endings (Roadmap GAP-35e)', () => {
  const entry = {
    timestampIso: '2026-09-21T10:00:00Z',
    agentName: 'claude',
    taskExternalId: 'T-1',
    statusWord: 'DONE',
    summary: 's',
    files: 'f',
    verify: 'v',
  };

  it('appends with the file’s own line ending, so a CRLF ledger stays CRLF', () => {
    const existing = '# Agents log\r\n\r\n## Entries\r\n';
    const updated = appendAgentslogEntry(existing, entry);

    expect(updated.startsWith(existing.trimEnd())).toBe(true);
    expect(/(?<!\r)\n/.test(updated)).toBe(false);
    expect(updated.endsWith('- Verify: v\r\n')).toBe(true);
  });

  it('keeps LF for an LF ledger', () => {
    const updated = appendAgentslogEntry('# Agents log\n', entry);
    expect(updated.includes('\r')).toBe(false);
  });
});
