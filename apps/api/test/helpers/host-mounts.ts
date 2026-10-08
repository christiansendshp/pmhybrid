import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Two folders the e2e app is told are the same folder of the user's machine
 * (`PROJECT_DOCS_HOST_MOUNTS`, Roadmap UX-05), as a Docker deployment has a folder
 * mounted twice. Under the OS temp dir, which is an allowed root for the suite.
 */
export const MOUNT_A = path.join(tmpdir(), 'pmh-e2e-mount-a');
export const MOUNT_B = path.join(tmpdir(), 'pmh-e2e-mount-b');
/** What the user calls both of them. */
export const MOUNTED_HOST = 'C:/E2E/Mounted';
/** The same, the way a person types it. */
export const MOUNTED_HOST_WINDOWS = 'C:\\E2E\\Mounted';
export const HOST_MOUNTS_ENV = [MOUNT_A, MOUNT_B]
  .map((container) => `${container}|${MOUNTED_HOST}`)
  .join(';');
