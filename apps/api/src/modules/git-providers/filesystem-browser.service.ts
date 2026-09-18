import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.validation.js';
import {
  DOCUMENT_KINDS,
  resolveDocumentFilename,
} from '../roadmap/document-kind.util.js';

export interface FilesystemEntry {
  name: string;
  path: string;
}

export interface DocumentPresence {
  kind: string;
  filename: string;
  found: boolean;
}

export interface BrowseDirectoryResult {
  path: string;
  parentPath: string | null;
  root: string;
  directories: FilesystemEntry[];
  documents: DocumentPresence[];
}

/**
 * Lets the "create project" / "project settings" UI browse the API server's
 * own local filesystem to pick a `docsPath`, instead of typing a raw path
 * (Roadmap GAP-27). Browsers cannot hand a web app a real OS path — the File
 * System Access API only ever returns a sandboxed handle — and `docsPath` is
 * read server-side by `LocalFsGitProvider`, so browsing has to happen on the
 * server the same way reading does.
 *
 * Confined to `PROJECT_DOCS_BROWSE_ROOT` (defaults to the API process's home
 * directory) so this doesn't become a way to enumerate the whole disk —
 * project creation itself needs no extra permission, so this endpoint only
 * requires being authenticated, and the root confinement is the actual
 * safeguard (docs/permissions.md).
 *
 * Only meaningful when GIT_PROVIDER_TYPE=local: it browses the API server's
 * own disk to fill in a `docsPath` that, under GIT_PROVIDER_TYPE=github,
 * means an "owner/repo/subpath" slug instead (Roadmap GAP-23) — a local
 * disk browse can't produce that, so this refuses outright rather than
 * silently returning folders that don't mean what the picker implies.
 */
@Injectable()
export class FilesystemBrowserService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  async browse(
    requestedPath: string | undefined,
  ): Promise<BrowseDirectoryResult> {
    if (
      this.configService.get('GIT_PROVIDER_TYPE', { infer: true }) !== 'local'
    ) {
      throw new ConflictException(
        'The filesystem browser is only available when GIT_PROVIDER_TYPE=local',
      );
    }
    const root = path.resolve(
      this.configService.get('PROJECT_DOCS_BROWSE_ROOT', { infer: true }),
    );
    const target = path.resolve(
      requestedPath && requestedPath.length > 0 ? requestedPath : root,
    );

    if (target !== root) {
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new BadRequestException(
          `Path is outside the allowed root: ${root}`,
        );
      }
    }

    let stat;
    try {
      stat = await fs.stat(target);
    } catch {
      throw new BadRequestException(`Directory not found: ${target}`);
    }
    if (!stat.isDirectory()) {
      throw new BadRequestException(`Not a directory: ${target}`);
    }

    const entries = await fs.readdir(target, { withFileTypes: true });
    const directories: FilesystemEntry[] = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(target, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const documents: DocumentPresence[] = await Promise.all(
      DOCUMENT_KINDS.map(async (kind) => {
        const filename = resolveDocumentFilename(kind);
        const found = await fs
          .access(path.join(target, filename))
          .then(() => true)
          .catch(() => false);
        return { kind, filename, found };
      }),
    );

    return {
      path: target,
      parentPath: target === root ? null : path.dirname(target),
      root,
      directories,
      documents,
    };
  }
}
