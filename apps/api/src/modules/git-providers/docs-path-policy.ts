import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';

const NOT_ALLOWED = 'Path is outside the allowed roots for project documents';

/** A leading `\\` or `//` is a UNC share or a Windows device path (`\\?\`, `\\.\`). */
const UNC_OR_DEVICE = /^[\\/]{2}/;

/**
 * `PROJECT_DOCS_BROWSE_ROOT` may list several roots separated by
 * `path.delimiter` (`;` on Windows, `:` elsewhere). Every root is made
 * absolute so containment checks compare like with like.
 */
export function parseAllowedRoots(raw: string): string[] {
  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => path.resolve(entry));
}

/** Windows paths are case-insensitive; compare them lowercased. */
const comparable = (value: string) =>
  process.platform === 'win32' ? value.toLowerCase() : value;

/** True when `target` is `root` itself or a descendant of it. */
export function isInside(root: string, target: string): boolean {
  const relative = path.relative(comparable(root), comparable(target));
  if (relative === '') {
    return true;
  }
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/** Stable identity of a folder for "is another project already using it". */
export function docsPathKey(value: string): string {
  return comparable(path.resolve(value));
}

/**
 * Local provider (`GIT_PROVIDER_TYPE=local`): `docsPath` is read and written
 * by the API process itself, so it must stay inside an allowed root — the
 * same confinement the folder picker already applies, now enforced where
 * the value is stored and used (Roadmap SECURITY-01). The real location is
 * checked too, so a symlink or junction inside a root cannot lead out of it.
 * Returns the absolute, normalized path to store.
 */
export async function resolveAllowedLocalDocsPath(
  raw: string,
  roots: string[],
): Promise<string> {
  const trimmed = raw.trim();
  if (trimmed.includes('\0') || UNC_OR_DEVICE.test(trimmed)) {
    throw new BadRequestException(NOT_ALLOWED);
  }
  const resolved = path.resolve(trimmed);
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new BadRequestException(NOT_ALLOWED);
  }
  const real = await fs.realpath(resolved).catch(() => null);
  if (real !== null) {
    const realRoots = await Promise.all(
      roots.map((root) => fs.realpath(root).catch(() => root)),
    );
    if (!realRoots.some((root) => isInside(root, real))) {
      throw new BadRequestException(NOT_ALLOWED);
    }
  }
  return resolved;
}

/**
 * Remote providers (`GIT_PROVIDER_TYPE=github`): `docsPath` is an
 * "owner/repo/subpath" slug, not a folder, so root confinement does not
 * apply — but it must never smuggle a parent-directory segment or a NUL.
 */
export function assertSafeRemoteDocsPath(raw: string): void {
  const segments = raw.split(/[\\/]+/);
  if (raw.includes('\0') || segments.includes('..')) {
    throw new BadRequestException('docsPath contains a forbidden segment');
  }
}
