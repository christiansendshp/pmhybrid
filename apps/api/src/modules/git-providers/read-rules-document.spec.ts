import { describe, expect, it, vi } from 'vitest';
import type { ProjectRepositoryProvider } from './project-repository-provider.interface.js';
import { readRulesDocument } from './read-rules-document.js';

function provider(
  files: { docs?: string; root?: string } = {},
): ProjectRepositoryProvider {
  return {
    readFile: vi.fn(async (_docsPath: string, relativePath: string) => {
      if (relativePath === 'Agents.md' && files.docs !== undefined) {
        return files.docs;
      }
      throw new Error('ENOENT');
    }),
    readRootRulesFile: vi.fn(async () => {
      if (files.root === undefined) {
        throw new Error('ENOENT root');
      }
      return files.root;
    }),
    writeFile: vi.fn(),
    listRevisions: vi.fn(),
  } as unknown as ProjectRepositoryProvider;
}

describe('readRulesDocument (Roadmap GAP-37c)', () => {
  it('prefers docs/Agents.md, so a project on the older layout shows what it always did', async () => {
    const both = provider({ docs: '# docs rules', root: '# root rules' });

    expect(await readRulesDocument(both, '/p/docs')).toEqual({
      content: '# docs rules',
      filePath: 'Agents.md',
    });
    expect(both.readRootRulesFile).not.toHaveBeenCalled();
  });

  it('falls back to the repository-root AGENTS.md the latest skill uses', async () => {
    expect(
      await readRulesDocument(provider({ root: '# root rules' }), '/p/docs'),
    ).toEqual({ content: '# root rules', filePath: 'AGENTS.md' });
  });

  it('rejects when neither file exists', async () => {
    await expect(readRulesDocument(provider(), '/p/docs')).rejects.toThrow(
      /ENOENT root/,
    );
  });
});
