import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EnvConfig } from '../../config/env.validation.js';
import { LocalFsGitProvider } from './local-fs-git-provider.service.js';

describe('LocalFsGitProvider confinement (Roadmap SECURITY-01)', () => {
  let root: string;
  let outside: string;
  let provider: LocalFsGitProvider;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'pmh-provider-root-'));
    outside = mkdtempSync(path.join(tmpdir(), 'pmh-provider-outside-'));
    writeFileSync(path.join(root, 'Roadmap.md'), '# inside', 'utf-8');
    writeFileSync(path.join(outside, 'Roadmap.md'), '# secret', 'utf-8');
    const config = {
      get: (key: keyof EnvConfig) =>
        key === 'PROJECT_DOCS_BROWSE_ROOT' ? root : undefined,
    } as unknown as ConfigService<EnvConfig, true>;
    provider = new LocalFsGitProvider(config);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('reads and writes inside an allowed root', async () => {
    expect(await provider.readFile(root, 'Roadmap.md')).toBe('# inside');
    await provider.writeFile(root, 'Agentslog.md', '# log');
    expect(readFileSync(path.join(root, 'Agentslog.md'), 'utf-8')).toBe(
      '# log',
    );
  });

  it('refuses to read a folder that is now outside every root', async () => {
    await expect(
      provider.readFile(outside, 'Roadmap.md'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to write outside every root and leaves the folder untouched', async () => {
    await expect(
      provider.writeFile(outside, 'Roadmap.md', '# overwritten'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(readFileSync(path.join(outside, 'Roadmap.md'), 'utf-8')).toBe(
      '# secret',
    );
  });

  it('returns no revisions (instead of running git) for a folder outside every root', async () => {
    expect(await provider.listRevisions(outside, 'Roadmap.md')).toEqual([]);
  });
});
