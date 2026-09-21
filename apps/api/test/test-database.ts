/**
 * The dedicated database local e2e runs use (Roadmap TEST-01a). Named once here
 * because two things must agree on it: the e2e config points the specs at it,
 * and the global setup resets it — and the setup must be able to refuse any
 * other database by name.
 */
export const LOCAL_TEST_DATABASE_URL =
  'postgresql://pmhybrid:pmhybrid@localhost:5436/pmhybrid_test?schema=public';

/** Only a database whose name says it is for tests may be reset. */
export function isDedicatedTestDatabase(url: string): boolean {
  try {
    return new URL(url).pathname === '/pmhybrid_test';
  } catch {
    return false;
  }
}
