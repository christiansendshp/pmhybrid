/**
 * The seed plants a global ADMIN with a documented password (demo1234) and
 * demo projects. That is right for a laptop and a disposable CI database and
 * catastrophic in production, where anyone who has read the README can sign in
 * as an administrator (Roadmap SECURITY-04a). It therefore refuses a production
 * environment unless it is told, on purpose, that this really is a demo one.
 */
export function assertSeedAllowed(
  env: Record<string, string | undefined>,
): void {
  if (
    env.NODE_ENV?.toLowerCase() === 'production' &&
    env.SEED_ALLOW_DEMO_DATA !== 'true'
  ) {
    throw new Error(
      'Refusing to seed demo data (a global ADMIN with a documented password) into NODE_ENV=production. ' +
        'Set SEED_ALLOW_DEMO_DATA=true only if this really is a disposable demo environment.',
    );
  }
}
