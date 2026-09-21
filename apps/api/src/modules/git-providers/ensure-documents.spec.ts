import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EnvConfig } from '../../config/env.validation.js';
import { GitHubGitProvider } from './github-git-provider.service.js';
import { LocalFsGitProvider } from './local-fs-git-provider.service.js';

describe('ensureDocuments (Roadmap GAP-36a)', () => {
  let root: string;
  let provider: LocalFsGitProvider;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'pmh-ensure-'));
    const config = {
      get: (key: keyof EnvConfig) =>
        key === 'PROJECT_DOCS_BROWSE_ROOT' ? root : undefined,
    } as unknown as ConfigService<EnvConfig, true>;
    provider = new LocalFsGitProvider(config);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const FILES = { 'Roadmap.md': '# Roadmap\n', 'Agentslog.md': '# Log\n' };

  it('creates a folder that is not there, with every file', async () => {
    const docs = path.join(root, 'new-project', 'docs');

    const created = await provider.ensureDocuments(docs, FILES);

    expect(created.sort()).toEqual(['Agentslog.md', 'Roadmap.md']);
    expect(readFileSync(path.join(docs, 'Roadmap.md'), 'utf-8')).toBe(
      '# Roadmap\n',
    );
  });

  it('never overwrites a file that is already there, and only creates the missing one', async () => {
    const docs = path.join(root, 'existing');
    await provider.ensureDocuments(docs, { 'Roadmap.md': 'first' });
    writeFileSync(
      path.join(docs, 'Roadmap.md'),
      'the person edited this',
      'utf-8',
    );

    const created = await provider.ensureDocuments(docs, FILES);

    expect(created).toEqual(['Agentslog.md']);
    expect(readFileSync(path.join(docs, 'Roadmap.md'), 'utf-8')).toBe(
      'the person edited this',
    );
  });

  it('creates nothing the second time', async () => {
    const docs = path.join(root, 'twice');
    await provider.ensureDocuments(docs, FILES);

    expect(await provider.ensureDocuments(docs, FILES)).toEqual([]);
  });

  it('refuses a folder outside every allowed root, and creates nothing there', async () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'pmh-outside-'));
    try {
      await expect(
        provider.ensureDocuments(path.join(outside, 'docs'), FILES),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(existsSync(path.join(outside, 'docs'))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("is a no-op for GitHub, where creating a file is a commit to someone else's repository", async () => {
    const github = new GitHubGitProvider({
      get: () => 'gh_token',
    } as unknown as ConfigService<EnvConfig, true>);

    expect(await github.ensureDocuments()).toEqual([]);
  });
});
