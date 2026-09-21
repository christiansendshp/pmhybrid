/** Placeholders that ship in examples and CI: never acceptable as a production secret. */
const KNOWN_PLACEHOLDERS = new Set([
  'change-me',
  'changeme',
  'secret',
  'password',
  'jwt-secret',
  'ci-only-not-a-real-secret',
]);

export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Why a JWT signing secret is too weak to sign with (Roadmap SECURITY-04a), or
 * null when it is acceptable. It signs every access and refresh token, so a
 * guessable one lets anyone mint a token for any actor.
 */
export function weakJwtSecretReason(secret: string): string | null {
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    return `it is ${secret.length} characters; use at least ${MIN_JWT_SECRET_LENGTH} (e.g. \`openssl rand -base64 48\`)`;
  }
  if (KNOWN_PLACEHOLDERS.has(secret.trim().toLowerCase())) {
    return 'it is a known placeholder';
  }
  return null;
}
