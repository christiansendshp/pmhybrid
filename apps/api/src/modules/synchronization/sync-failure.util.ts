import { RoadmapFormatError } from '../roadmap/roadmap-yaml-entry.util.js';

/** What a failed sync run says about itself, and whose fault it is. */
export interface SyncFailure {
  /** One readable line, safe to persist and show to any project member. */
  message: string;
  /** A problem in the project's own documents/folder that its members can fix — answered as 422, not as a server crash. */
  fixable: boolean;
}

const MAX_MESSAGE_LENGTH = 300;

/** Filesystem errors that mean "the docs folder or a document is not readable as configured" rather than a fault in this server. */
const FIXABLE_FS_CODES = new Set([
  'ENOENT',
  'EACCES',
  'EPERM',
  'ENOTDIR',
  'EISDIR',
]);

// Windows drive/UNC paths and POSIX absolute paths, wherever they appear.
const ABSOLUTE_PATH = /(?:[A-Za-z]:[\\/]|\\\\|\/(?=[\w.-]+\/))[^\s'"`]*/g;

/** One line, no filesystem paths, bounded — the run's summary is readable by every member of the project. */
export function sanitizeSyncMessage(raw: string): string {
  const oneLine = raw.split('\n')[0].replace(ABSOLUTE_PATH, '<path>').trim();
  return oneLine.length > MAX_MESSAGE_LENGTH
    ? `${oneLine.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : oneLine;
}

/**
 * Why a change to a task was not saved, when the reason is the project's
 * documents rather than a fault in this server (Roadmap BUG-07): the write
 * of the document failed, so the whole change was rolled back. Null for any
 * other error, which keeps its own status.
 */
export function describeNotSaved(error: unknown): string | null {
  if (error instanceof RoadmapFormatError) {
    return `Not saved: ${sanitizeSyncMessage(error.message)}`;
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && FIXABLE_FS_CODES.has(code)) {
    return `Not saved: the project's docs folder could not be read or written (${code}) — check that it exists and is writable. Nothing was changed`;
  }
  return null;
}

/**
 * Turns whatever a sync run threw into a message worth persisting. The old
 * behaviour stored the raw message — for a YAML problem a multi-line code
 * frame, for a missing folder an absolute path of the server's disk — and
 * surfaced it as an opaque 500 (Roadmap BUG-05).
 */
export function describeSyncFailure(error: unknown): SyncFailure {
  if (error instanceof RoadmapFormatError) {
    return { message: sanitizeSyncMessage(error.message), fixable: true };
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && FIXABLE_FS_CODES.has(code)) {
    return {
      message: `Could not read Roadmap.md or Agentslog.md from the project's docs folder (${code}) — check that the folder exists and holds them`,
      fixable: true,
    };
  }
  // Anything else (including an HttpException such as the docsPath re-check,
  // which already carries its own status) is rethrown as-is by runSync.
  const raw = error instanceof Error ? error.message : 'Unknown error';
  return {
    message: sanitizeSyncMessage(raw) || 'Unknown error',
    fixable: false,
  };
}
