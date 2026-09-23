import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EnvConfig } from '../../config/env.validation.js';
import { FilesystemBrowserService } from './filesystem-browser.service.js';

describe('FilesystemBrowserService', () => {
  let root: string;
  let service: FilesystemBrowserService;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'pmhybrid-browse-'));
    mkdirSync(path.join(root, 'project-a'));
    mkdirSync(path.join(root, '.hidden'));
    writeFileSync(path.join(root, 'project-a', 'Roadmap.md'), '# Roadmap');
    // No Agentslog.md here — a real "not fully set up yet" folder.

    const config = {
      get: (key: string) => (key === 'GIT_PROVIDER_TYPE' ? 'local' : root),
    };
    service = new FilesystemBrowserService(
      config as unknown as ConfigService<EnvConfig, true>,
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists subdirectories at the configured root and hides dotfolders', async () => {
    const result = await service.browse(undefined);

    expect(result.path).toBe(root);
    expect(result.parentPath).toBeNull();
    expect(result.directories.map((d) => d.name)).toEqual(['project-a']);
  });

  it('reports which of the six canonical docs are present in the viewed folder', async () => {
    const result = await service.browse(path.join(root, 'project-a'));

    const roadmap = result.documents.find((d) => d.kind === 'roadmap');
    const agentslog = result.documents.find((d) => d.kind === 'agentslog');
    expect(roadmap).toMatchObject({ filename: 'Roadmap.md', found: true });
    expect(agentslog).toMatchObject({ filename: 'Agentslog.md', found: false });
    expect(result.parentPath).toBe(root);
  });

  it('refuses a path outside the configured root', async () => {
    await expect(service.browse(tmpdir())).rejects.toThrow(
      /outside the allowed root/,
    );
  });

  it('refuses a file path and a nonexistent path', async () => {
    const filePath = path.join(root, 'project-a', 'Roadmap.md');
    await expect(service.browse(filePath)).rejects.toThrow(/Not a directory/);
    await expect(
      service.browse(path.join(root, 'does-not-exist')),
    ).rejects.toThrow(/not found/);
  });

  it('reports every configured root, not just the current one (Roadmap BUG-11)', async () => {
    const result = await service.browse(undefined);

    expect(result.root).toBe(root);
    expect(result.roots).toEqual([root]);
  });

  it('serves a second `path.delimiter`-separated root, and lists both in `roots`', async () => {
    const secondRoot = mkdtempSync(path.join(tmpdir(), 'pmhybrid-browse-2-'));
    mkdirSync(path.join(secondRoot, 'other-project'));
    try {
      const config = {
        get: (key: string) =>
          key === 'GIT_PROVIDER_TYPE'
            ? 'local'
            : `${root}${path.delimiter}${secondRoot}`,
      };
      const multiRootService = new FilesystemBrowserService(
        config as unknown as ConfigService<EnvConfig, true>,
      );

      const atFirstRoot = await multiRootService.browse(undefined);
      expect(atFirstRoot.root).toBe(root);
      expect(atFirstRoot.roots).toEqual([root, secondRoot]);

      const atSecondRoot = await multiRootService.browse(secondRoot);
      expect(atSecondRoot.root).toBe(secondRoot);
      expect(atSecondRoot.parentPath).toBeNull();
      expect(atSecondRoot.directories.map((d) => d.name)).toEqual([
        'other-project',
      ]);
      expect(atSecondRoot.roots).toEqual([root, secondRoot]);
    } finally {
      rmSync(secondRoot, { recursive: true, force: true });
    }
  });

  it('refuses to browse when GIT_PROVIDER_TYPE is not local (Roadmap GAP-23)', async () => {
    const githubConfig = {
      get: (key: string) => (key === 'GIT_PROVIDER_TYPE' ? 'github' : root),
    };
    const githubService = new FilesystemBrowserService(
      githubConfig as unknown as ConfigService<EnvConfig, true>,
    );
    await expect(githubService.browse(undefined)).rejects.toThrow(
      /only available when GIT_PROVIDER_TYPE=local/,
    );
  });
});
