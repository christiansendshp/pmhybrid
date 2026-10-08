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
  isInside,
  parseAllowedRoots,
  resolveAllowedLocalDocsPath,
} from './docs-path-policy.js';
import { fromHostPath, parseHostMounts, toHostPath } from './host-mounts.js';
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

/** A root the picker can jump to (Roadmap BUG-11), named the way the user knows the folder (Roadmap UX-05). */
export interface BrowseRoot {
  path: string;
  label: string;
}

/** One step of the way from the root to the folder being viewed. */
export interface BrowseCrumb {
  name: string;
  path: string;
}

export interface BrowseDirectoryResult {
  /** The folder as the API sees it: what is stored as the project's `docsPath`. */
  path: string;
  /** The same folder as the user knows it (`C:Users…`), or `path` when no mount names it (Roadmap UX-05). */
  displayPath: string;
  parentPath: string | null;
  root: string;
  /** Every configured root (Roadmap BUG-11), not just `root` — lets the picker offer a way to jump to any of them, not only the one the viewed path is under. */
  roots: BrowseRoot[];
  /** From the root to the folder being viewed, the first being the root itself. */
  breadcrumbs: BrowseCrumb[];
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
 * directory; several roots may be listed with the platform path delimiter)
 * so this doesn't become a way to enumerate the whole disk. The same roots
 * now also confine every stored `docsPath` (Roadmap SECURITY-01), so this
 * endpoint only requires being authenticated and the root confinement is
 * the actual safeguard (docs/permissions.md).
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
    const roots = parseAllowedRoots(
      this.configService.get('PROJECT_DOCS_BROWSE_ROOT', { infer: true }),
    );
    const mounts = parseHostMounts(
      this.configService.get('PROJECT_DOCS_HOST_MOUNTS', { infer: true }),
    );
    // Same confinement a stored docsPath gets (real location included, so a
    // symlink inside a root cannot lead out of it); the picker starts at the
    // first configured root and can browse any of them. A path written the way
    // the user knows it (C:Users…) is read through the mount map first.
    const target =
      requestedPath && requestedPath.length > 0
        ? await resolveAllowedLocalDocsPath(
            fromHostPath(requestedPath, mounts) ?? requestedPath,
            roots,
          )
        : roots[0];
    const root = roots.find((candidate) => isInside(candidate, target))!;

    let stat;
    try {
      stat = await fs.stat(target);
    } catch {
      throw new BadRequestException(`Directory not found: ${target}`);
    }
    if (!stat.isDirectory()) {
      throw new BadRequestException(`Not a directory: ${target}`);
    }

    let entries;
    try {
      entries = await fs.readdir(target, { withFileTypes: true });
    } catch {
      // A folder the API process may not read: said as such, not as a server error.
      throw new BadRequestException(`Cannot read the directory: ${target}`);
    }
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

    const breadcrumbs = [{ name: toHostPath(root, mounts), path: root }];
    let cursor = root;
    for (const segment of path
      .relative(root, target)
      .split(path.sep)
      .filter(Boolean)) {
      cursor = path.join(cursor, segment);
      breadcrumbs.push({ name: segment, path: cursor });
    }

    return {
      path: target,
      displayPath: toHostPath(target, mounts),
      parentPath: target === root ? null : path.dirname(target),
      root,
      roots: roots.map((candidate) => ({
        path: candidate,
        label: toHostPath(candidate, mounts),
      })),
      breadcrumbs,
      directories,
      documents,
    };
  }
}
