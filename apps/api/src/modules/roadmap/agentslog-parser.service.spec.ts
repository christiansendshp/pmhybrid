import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AgentslogParserService } from './agentslog-parser.service.js';
import { SKILL_AGENTSLOG } from './skill-format.fixtures.js';

const SAMPLE = `# Agents log

## Entry format

\`\`\`markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | DONE

- Summary: observable outcome
- Files: compact paths or component names
- Verify: command and result
- Follow-up: none or one pointer
\`\`\`

## Previous segment

- Archive: \`docs/history/Agentslog-20260101-001.md\`
- SHA-256: \`abc123\`

## Entries

## [2026-09-14T10:00:00Z] | claude-code | F01-S01-T01 | DONE
- Summary: shipped the widget
- Files: src/widget.ts
- Verify: pnpm test -> green
- Follow-up: none

## [2026-09-14T11:00:00Z] | claude-code | F01-S01-T02 | IN_PROGRESS
- Summary: started the other thing
- Files: src/other.ts
- Verify: n/a
- Follow-up: finish it
`;

describe('AgentslogParserService', () => {
  const parser = new AgentslogParserService();

  it('does not parse the fenced "## Entry format" example as a real entry', () => {
    const { entries } = parser.parse(SAMPLE);
    expect(entries.some((e) => e.taskExternalId === 'TASK-ID')).toBe(false);
  });

  it('parses each entry header and its four bullets', () => {
    const { entries } = parser.parse(SAMPLE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      agentName: 'claude-code',
      taskExternalId: 'F01-S01-T01',
      statusWord: 'DONE',
      summary: 'shipped the widget',
      files: 'src/widget.ts',
      verify: 'pnpm test -> green',
      followUp: 'none',
    });
  });

  it('computes a stable rawEntryHash for idempotent re-ingestion', () => {
    const first = parser.parse(SAMPLE).entries[0].rawEntryHash;
    const second = parser.parse(SAMPLE).entries[0].rawEntryHash;
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives different entries different hashes', () => {
    const { entries } = parser.parse(SAMPLE);
    expect(entries[0].rawEntryHash).not.toBe(entries[1].rawEntryHash);
  });

  it('surfaces the rotation pointer without following it', () => {
    const { previousSegment } = parser.parse(SAMPLE);
    expect(previousSegment).toEqual({
      archivePath: 'docs/history/Agentslog-20260101-001.md',
      sha256: 'abc123',
    });
  });
});

describe('AgentslogParserService — skill v2 format (Pause bullet, no Follow-up)', () => {
  const parser = new AgentslogParserService();

  it('parses a PAUSE entry with a Pause bullet and no Follow-up, instead of silently dropping it', () => {
    const log = `# Agents log

## Entries

## [2026-09-17T10:00:00Z] | claude | TASK-42 | PAUSE

- Summary: blocked on a decision
- Pause: BLOQUEO - waiting on DEC-007
`;
    const { entries } = parser.parse(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      taskExternalId: 'TASK-42',
      statusWord: 'PAUSE',
      summary: 'blocked on a decision',
      pause: 'BLOQUEO - waiting on DEC-007',
      files: '',
      verify: '',
      followUp: '',
    });
  });

  it('parses a DONE entry with only Summary/Verify (Files omitted, no Follow-up)', () => {
    const log = `# Agents log

## Entries

## [2026-09-17T11:00:00Z] | claude | TASK-43 | DONE

- Summary: shipped it
- Verify: pnpm test -> green
`;
    const { entries } = parser.parse(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      taskExternalId: 'TASK-43',
      statusWord: 'DONE',
      summary: 'shipped it',
      verify: 'pnpm test -> green',
      files: '',
      followUp: '',
    });
    expect(entries[0].pause).toBeUndefined();
  });

  it('still parses an old-format entry (all four bullets, no Pause) unchanged', () => {
    const log = `# Agents log

## Entries

## [2026-09-17T12:00:00Z] | claude | TASK-44 | DONE

- Summary: old-format entry
- Files: a.ts
- Verify: ok
- Follow-up: none
`;
    const { entries } = parser.parse(log);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      summary: 'old-format entry',
      files: 'a.ts',
      verify: 'ok',
      followUp: 'none',
    });
    expect(entries[0].pause).toBeUndefined();
  });

  it('a bullet name repeating ends the block rather than overwriting or running on', () => {
    const log = `# Agents log

## Entries

## [2026-09-17T13:00:00Z] | claude | TASK-45 | DONE

- Summary: first value
- Summary: second value should not be reached
`;
    const { entries } = parser.parse(log);
    expect(entries[0].summary).toBe('first value');
  });
});

describe('AgentslogParserService latest skill ledger (Roadmap GAP-37a)', () => {
  const { entries } = new AgentslogParserService().parse(SKILL_AGENTSLOG);

  it('reads the three entry states and skips the format example in its fence', () => {
    expect(
      entries.map((entry) => [entry.taskExternalId, entry.statusWord]),
    ).toEqual([
      ['F01-E01-T01', 'IN_PROGRESS'],
      ['F01-E01-T02', 'PAUSE'],
      ['F01-E01-T00', 'DONE'],
    ]);
  });

  it('reads the Pause bullet of a PAUSE entry, and the bullets a skill entry leaves out as empty', () => {
    expect(entries[1]).toMatchObject({
      pause: 'BLOQUEO - waiting for the schema review',
      files: '',
      verify: '',
      followUp: '',
    });
    expect(entries[0].verify).toBe('pending');
    expect(entries[2]).toMatchObject({
      files: 'package.json',
      verify: 'pnpm test passes',
    });
  });
});

describe('AgentslogParserService: the lines a handoff and a review add (Roadmap TASK-06)', () => {
  const parser = new AgentslogParserService();
  const entry = (word: string, lines: string[]) =>
    parser.parse(
      [
        '# Agents log',
        '',
        '## Entries',
        '',
        `## [2026-10-13T10:00:00Z] | claude-sonnet-5-5 | TASK-01 | ${word}`,
        ...lines,
        '',
      ].join('\n'),
    ).entries[0];

  it('reads the Handoff line, with or without a reviewer', () => {
    expect(
      entry('REVIEW', ['- Summary: s', '- Verify: v', '- Handoff: qa-agent']),
    ).toMatchObject({ statusWord: 'REVIEW', handoff: 'qa-agent' });
    expect(
      entry('REVIEW', ['- Summary: s', '- Verify: v'])?.handoff,
    ).toBeUndefined();
  });

  it('reads the result of a Review line, and nothing from a malformed one', () => {
    expect(
      entry('REVIEW', ['- Summary: s', '- Review: PASS - looks right'])?.review,
    ).toBe('PASS');
    expect(
      entry('REVIEW', ['- Summary: s', '- Review: FAIL - the edge case'])
        ?.review,
    ).toBe('FAIL');
    expect(
      entry('REVIEW', ['- Summary: s', '- Review: maybe'])?.review,
    ).toBeUndefined();
  });

  it('reads the lines in any order and keeps every other field', () => {
    expect(
      entry('REVIEW', [
        '- Summary: handed over',
        '- Verify: tests pass',
        '- Handoff: qa-agent',
        '- Review: FAIL - needs a retry',
      ]),
    ).toMatchObject({
      summary: 'handed over',
      verify: 'tests pass',
      handoff: 'qa-agent',
      review: 'FAIL',
    });
  });

  it('leaves the hash of an entry that has neither line as it was', () => {
    const plain = ['- Summary: s', '- Verify: v'];
    const hash = entry('IN_PROGRESS', plain)?.rawEntryHash;

    expect(hash).toBe(
      createHash('sha256')
        .update(
          [
            '## [2026-10-13T10:00:00Z] | claude-sonnet-5-5 | TASK-01 | IN_PROGRESS',
            ...plain,
          ].join('\n'),
        )
        .digest('hex'),
    );
  });
});

describe('AgentslogParserService: the Name the latest skill writes after the status (Roadmap TASK-26)', () => {
  const parse = (header: string) =>
    new AgentslogParserService().parse(
      [
        '# Agents log',
        '',
        '## Entries',
        '',
        header,
        '- Summary: s',
        '- Verify: v',
      ].join('\n'),
    ).entries[0];

  it('reads the status word without the Name, so a DONE | Name is still the terminal word', () => {
    const done = parse(
      '## [2026-10-16T10:00:00Z] | claude-sonnet-5-5 | TASK-26 | DONE | Adopt the latest skill',
    );

    expect(done).toMatchObject({
      taskExternalId: 'TASK-26',
      statusWord: 'DONE',
    });
  });

  it('reads an empty Name, and an entry with no Name at all, the same way', () => {
    expect(
      parse(
        '## [2026-10-16T10:00:00Z] | claude-sonnet-5-5 | TASK-26 | IN_PROGRESS | ',
      ).statusWord,
    ).toBe('IN_PROGRESS');
    expect(
      parse('## [2026-10-16T10:00:00Z] | claude-sonnet-5-5 | TASK-26 | PAUSE')
        .statusWord,
    ).toBe('PAUSE');
  });

  it('keeps a qualifier of the status word, as before', () => {
    expect(
      parse(
        '## [2026-10-16T10:00:00Z] | claude | TASK-26 | DONE (partial) | A name',
      ).statusWord,
    ).toBe('DONE (partial)');
  });
});
