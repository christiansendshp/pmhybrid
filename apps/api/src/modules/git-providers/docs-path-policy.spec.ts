import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertSafeRemoteDocsPath,
  docsPathKey,
  isInside,
  parseAllowedRoots,
  resolveAllowedLocalDocsPath,
} from './docs-path-policy.js';

describe('docs-path-policy (Roadmap SECURITY-01)', () => {
  let root: string;
  let outside: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'pmh-policy-root-'));
    outside = mkdtempSync(path.join(tmpdir(), 'pmh-policy-outside-'));
    mkdirSync(path.join(root, 'proj'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('parses several roots split on the platform delimiter and ignores blanks', () => {
    const parsed = parseAllowedRoots(
      [root, '', `  ${outside}  `].join(path.delimiter),
    );
    expect(parsed).toEqual([path.resolve(root), path.resolve(outside)]);
  });

  it('isInside accepts the root and descendants but not siblings or parents', () => {
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, path.join(root, 'a', 'b'))).toBe(true);
    expect(isInside(root, `${root}-sibling`)).toBe(false);
    expect(isInside(root, path.dirname(root))).toBe(false);
    expect(isInside(root, path.join(root, '..', 'x'))).toBe(false);
  });

  it('resolves an allowed folder (existing or not) to an absolute path', async () => {
    expect(
      await resolveAllowedLocalDocsPath(path.join(root, 'proj'), [root]),
    ).toBe(path.resolve(root, 'proj'));
    expect(
      await resolveAllowedLocalDocsPath(path.join(root, 'not-yet'), [root]),
    ).toBe(path.resolve(root, 'not-yet'));
  });

  it('accepts a folder under any of several roots', async () => {
    await expect(
      resolveAllowedLocalDocsPath(path.join(outside, 'x'), [root, outside]),
    ).resolves.toBe(path.resolve(outside, 'x'));
  });

  it('rejects a folder outside every root, including ../ escapes', async () => {
    await expect(
      resolveAllowedLocalDocsPath(outside, [root]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolveAllowedLocalDocsPath(
        path.join(root, '..', path.basename(outside)),
        [root],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolveAllowedLocalDocsPath(
        process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc',
        [root],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects UNC, device paths and NUL bytes', async () => {
    for (const bad of [
      '\\\\server\\share\\docs',
      '//server/share/docs',
      '\\\\?\\C:\\docs',
      '\\\\.\\pipe\\x',
      `${path.join(root, 'proj')}\0`,
    ]) {
      await expect(
        resolveAllowedLocalDocsPath(bad, [root]),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects a symlink inside the root that leads outside it', async () => {
    const link = path.join(root, 'escape');
    try {
      symlinkSync(outside, link, 'junction');
    } catch {
      // Creating links needs privileges on some Windows setups — nothing to assert then.
      return;
    }
    await expect(
      resolveAllowedLocalDocsPath(link, [root]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('docsPathKey treats equivalent spellings of one folder as equal', () => {
    expect(docsPathKey(path.join(root, 'proj'))).toBe(
      docsPathKey(path.join(root, 'proj', '..', 'proj')),
    );
    expect(docsPathKey(path.join(root, 'a'))).not.toBe(
      docsPathKey(path.join(root, 'b')),
    );
  });

  it('remote (github) slugs must not carry parent segments or NUL', () => {
    expect(() => assertSafeRemoteDocsPath('owner/repo/docs')).not.toThrow();
    expect(() => assertSafeRemoteDocsPath('owner/repo/../other')).toThrow(
      BadRequestException,
    );
    expect(() => assertSafeRemoteDocsPath('owner\\..\\repo')).toThrow(
      BadRequestException,
    );
    expect(() => assertSafeRemoteDocsPath('owner/repo\0')).toThrow(
      BadRequestException,
    );
  });
});
