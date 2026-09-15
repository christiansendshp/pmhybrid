import { createHash, randomBytes } from 'node:crypto';

/**
 * Controlled API access for AI agents (brief §27, §28, Roadmap GAP-15).
 *
 * The plaintext key is `pmh_<64 hex chars>` — 256 bits of generator entropy,
 * not a user-chosen secret — so it is hashed with plain SHA-256 rather than
 * argon2id (Stack_Tecnologies.md ADR-009): there is no dictionary to defend
 * against, and a deliberately slow hash would only cost CPU on every agent
 * request while doing nothing for security. Because SHA-256 is deterministic,
 * the hash itself can be the unique lookup key — no separate salt or prefix
 * search needed.
 */
export const API_KEY_PREFIX = 'pmh_';

export interface GeneratedApiKey {
  /** Shown to the caller exactly once. Never persisted. */
  plaintext: string;
  /** First 8 hex chars of the secret — plaintext, display-only, lets an admin tell keys apart. */
  prefix: string;
  /** SHA-256 hex digest of the secret (the part after API_KEY_PREFIX). The stored, unique lookup key. */
  secretHash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(32).toString('hex');
  return {
    plaintext: `${API_KEY_PREFIX}${secret}`,
    prefix: secret.slice(0, 8),
    secretHash: hashApiKeySecret(secret),
  };
}

/** Hashes the secret half of a presented key (the caller strips API_KEY_PREFIX first). */
export function hashApiKeySecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
