import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AgentslogParserService } from '../roadmap/agentslog-parser.service.js';
import {
  AgentslogIngestionService,
  archiveCandidates,
} from './agentslog-ingestion.service.js';

const ARCHIVE = `# Agents log

## [2026-01-01T00:00:00Z] | claude | PMH-7 | DONE
- Summary: Finished
- Verify: tests pass
`;

function hotLog(archivePath: string, sha256: string): string {
  return `# Agents log

## Previous segment

- Archive: \`${archivePath}\`
- SHA-256: \`${sha256}\`

## Entries

## [2026-01-02T00:00:00Z] | claude | PMH-8 | IN_PROGRESS
- Summary: Working
- Verify: pending
`;
}

const sha = (content: string) =>
  createHash('sha256').update(content).digest('hex');

/** A provider that only has these files, relative to the docs folder. */
function providerWith(files: Record<string, string>) {
  return {
    readFile: vi.fn(async (_docsPath: string, file: string) => {
      if (!(file in files)) {
        throw new Error(`ENOENT ${file}`);
      }
      return files[file];
    }),
  };
}

function serviceWith(files: Record<string, string>) {
  const provider = providerWith(files);
  return {
    provider,
    service: new AgentslogIngestionService(
      new AgentslogParserService(),
      provider as never,
    ),
  };
}

describe('archiveCandidates (Roadmap BUG-09)', () => {
  it('offers the pointer as written and, when it starts at the repository root, without the docs folder', () => {
    expect(archiveCandidates('docs/history/Agentslog-1.md')).toEqual([
      'docs/history/Agentslog-1.md',
      'history/Agentslog-1.md',
    ]);
  });

  it('offers a pointer relative to the docs folder as it is', () => {
    expect(archiveCandidates('history/Agentslog-1.md')).toEqual([
      'history/Agentslog-1.md',
    ]);
    expect(archiveCandidates('./history/Agentslog-1.md')).toEqual([
      'history/Agentslog-1.md',
    ]);
  });

  it('reads a Windows separator as a slash', () => {
    expect(archiveCandidates('docs\\history\\Agentslog-1.md')).toEqual([
      'docs/history/Agentslog-1.md',
      'history/Agentslog-1.md',
    ]);
  });
});

describe('AgentslogIngestionService.parseWithArchive (Roadmap BUG-09)', () => {
  const ids = (entries: { taskExternalId: string }[]) =>
    entries.map((entry) => entry.taskExternalId).sort();

  it('finds an archive whose pointer is relative to the docs folder', async () => {
    const { service } = serviceWith({ 'history/a.md': ARCHIVE });

    const entries = await service.parseWithArchive(
      'docs',
      hotLog('history/a.md', sha(ARCHIVE)),
    );

    expect(ids(entries)).toEqual(['PMH-7', 'PMH-8']);
  });

  it('finds an archive whose pointer is relative to the repository root, as the latest skill writes it', async () => {
    const { service } = serviceWith({ 'history/a.md': ARCHIVE });

    const entries = await service.parseWithArchive(
      'docs',
      hotLog('docs/history/a.md', sha(ARCHIVE)),
    );

    expect(ids(entries)).toEqual(['PMH-7', 'PMH-8']);
  });

  it('still refuses an archive whose hash is not the one the pointer states', async () => {
    const { service } = serviceWith({ 'history/a.md': ARCHIVE });

    const entries = await service.parseWithArchive(
      'docs',
      hotLog('docs/history/a.md', sha('something else')),
    );

    expect(ids(entries)).toEqual(['PMH-8']);
  });

  it('goes on with the hot log when the archive is nowhere', async () => {
    const { service } = serviceWith({});

    const entries = await service.parseWithArchive(
      'docs',
      hotLog('docs/history/a.md', sha(ARCHIVE)),
    );

    expect(ids(entries)).toEqual(['PMH-8']);
  });

  it('does not look further once it has found the archive', async () => {
    const { service, provider } = serviceWith({
      'docs/history/a.md': ARCHIVE,
      'history/a.md': 'not this one',
    });

    await service.parseWithArchive(
      'docs',
      hotLog('docs/history/a.md', sha(ARCHIVE)),
    );

    expect(provider.readFile).toHaveBeenCalledTimes(1);
  });
});
