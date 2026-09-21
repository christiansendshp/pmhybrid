/**
 * The people and agents the test suite made in the development database before it
 * had a database of its own (Roadmap IMPROVEMENT-02d): about forty of them
 * ("Dev", "Outsider", "Key Agent-1789571079560-741620") cluttered the Team page.
 * What gives them away is a millisecond timestamp, `Date.now()`, in the name or
 * the email — something a person's name or address does not have.
 */
const TIMESTAMP = /(?:^|\D)\d{13}(?:\D|$)/;

export function isTestFixtureActor(actor: {
  displayName: string;
  email: string | null;
}): boolean {
  return TIMESTAMP.test(actor.displayName) || TIMESTAMP.test(actor.email ?? '');
}

/**
 * The tidy-up is for a development database on this machine. It refuses a
 * production environment and any host that is not local, so a `DATABASE_URL` left
 * in the shell cannot point it at something real.
 */
export function assertLocalDatabase(
  env: Record<string, string | undefined>,
): void {
  if (env.NODE_ENV?.toLowerCase() === 'production') {
    throw new Error('Refusing to tidy a production environment');
  }
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a URL');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(
      `Refusing to tidy ${host}: this is for a development database on this machine`,
    );
  }
}
