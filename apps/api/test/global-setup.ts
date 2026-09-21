import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isDedicatedTestDatabase,
  LOCAL_TEST_DATABASE_URL,
} from './test-database.js';

/**
 * Starts every local e2e run from a migrated, seeded, empty database (Roadmap
 * TEST-01a). The specs create throwaway projects and never clean them up, so
 * the database used to grow by thousands of rows across runs — and had to be
 * reset by hand every few of them. CI needs none of this: its Postgres is a
 * fresh container each time.
 *
 * It resets only the dedicated test database, by name, and does nothing when
 * `CI` is set or when `E2E_KEEP_DB=1` (to look at what a failed run left).
 */
export default function resetLocalTestDatabase(): void {
  if (process.env.CI || process.env.E2E_KEEP_DB === '1') {
    return;
  }
  if (!isDedicatedTestDatabase(LOCAL_TEST_DATABASE_URL)) {
    throw new Error(
      'Refusing to reset a database that is not the dedicated test one',
    );
  }
  const apiRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const options = {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: LOCAL_TEST_DATABASE_URL, CI: 'true' },
    stdio: 'inherit' as const,
    shell: process.platform === 'win32',
  };
  execFileSync(
    'pnpm',
    ['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-seed'],
    options,
  );
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'seed'], options);
}
