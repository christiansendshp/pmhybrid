import path from 'node:path';
import { isInside } from './docs-path-policy.js';

/**
 * A folder of the machine the API's own filesystem sees under another name
 * (Roadmap UX-05). The API runs in a container: the user's `C:\Users\…\Documents`
 * is `/data/documents` to it. The map lets the folder picker show the path the
 * user knows, lets a path typed the Windows way be understood, and lets one
 * folder reached through two mounts count as one folder where that matters
 * (the check that keeps a project off another team's documents, SECURITY-01).
 */
export interface HostMount {
  /** The folder as the API sees it. */
  container: string;
  /** The folder as the user knows it, with `/` separators and no trailing one. */
  host: string;
}

const DRIVE_PATH = /^[A-Za-z]:([\\/]|$)/;

/** `C:\Users\me\` and `C:/Users//me` are the same: forward slashes, no repeats, no trailing one. */
function normalizeHost(value: string): string {
  const slashed = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
  return slashed.length > 1 && slashed.endsWith('/')
    ? slashed.slice(0, -1)
    : slashed;
}

/** Windows paths compare without regard to case, and so does everything given as one. */
const hostKey = (value: string) => normalizeHost(value).toLowerCase();

/**
 * `PROJECT_DOCS_HOST_MOUNTS`: `container|host` pairs separated by `;`, e.g.
 * `/data/documents|C:/Users/me/Documents;/data/extra-docs|D:/docs`. A pair that
 * is not one is ignored; the map is only a convenience on top of the roots, which
 * stay the safeguard.
 */
export function parseHostMounts(raw: string | undefined): HostMount[] {
  return (
    (raw ?? '')
      .split(';')
      .map((entry) => entry.split('|'))
      .filter((pair) => pair.length === 2)
      .map(([container, host]) => ({
        container: container.trim(),
        host: normalizeHost(host),
      }))
      // A relative host path (`./deploy/projects`, the compose default) says nothing a
      // person could use: such a folder is shown as the API sees it.
      .filter(
        (mount) =>
          mount.container.length > 0 &&
          (DRIVE_PATH.test(mount.host) || mount.host.startsWith('/')),
      )
      .map((mount) => ({ ...mount, container: path.resolve(mount.container) }))
  );
}

/** The user's way of writing a folder: backslashes for a drive path, as it is otherwise. */
function present(host: string): string {
  return DRIVE_PATH.test(host) ? host.replace(/\//g, '\\') : host;
}

/** The folder as the user knows it (forward slashes), through the mount that holds it most closely; null when none does. */
function mapToHost(resolved: string, mounts: HostMount[]): string | null {
  const mount = mounts
    .filter((candidate) => isInside(candidate.container, resolved))
    .sort((a, b) => b.container.length - a.container.length)[0];
  if (!mount) {
    return null;
  }
  const relative = path
    .relative(mount.container, resolved)
    .split(path.sep)
    .filter(Boolean)
    .join('/');
  return relative ? `${mount.host}/${relative}` : mount.host;
}

/**
 * The path as the user knows it: through the mount that holds it most closely, or
 * unchanged when no mount does.
 */
export function toHostPath(containerPath: string, mounts: HostMount[]): string {
  const host = mapToHost(path.resolve(containerPath), mounts);
  return host === null ? containerPath : present(host);
}

/**
 * A path written the way the user knows it (`C:\Users\me\Documents\x`), as the API
 * sees it (`/data/documents/x`), or null when no mount holds it — the caller then
 * takes the text as it is. The mount that holds it most closely wins. What comes
 * back is only a candidate: it is still checked against the allowed roots.
 */
export function fromHostPath(
  input: string,
  mounts: HostMount[],
): string | null {
  if (!DRIVE_PATH.test(input.trim())) {
    return null;
  }
  const wanted = hostKey(input);
  const mount = mounts
    .filter(
      (candidate) =>
        wanted === hostKey(candidate.host) ||
        wanted.startsWith(`${hostKey(candidate.host)}/`),
    )
    .sort((a, b) => b.host.length - a.host.length)[0];
  if (!mount) {
    return null;
  }
  const rest = normalizeHost(input).slice(mount.host.length);
  const segments = rest.split('/').filter(Boolean);
  return path.join(mount.container, ...segments);
}

/**
 * Stable identity of a folder, the same whichever mount it was reached through
 * and however it is written: the path as the user knows it when a mount holds
 * it, else the container path.
 */
export function folderKey(containerPath: string, mounts: HostMount[]): string {
  const resolved = path.resolve(containerPath);
  const host = mapToHost(resolved, mounts);
  if (host !== null) {
    return hostKey(host);
  }
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
