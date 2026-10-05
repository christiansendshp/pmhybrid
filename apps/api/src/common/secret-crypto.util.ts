import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * Encryption at rest for a secret the application itself has to read back
 * later (Roadmap GAP-39a: the LLM API key). A hash would not do — the key is
 * sent to the provider — so it is AES-256-GCM, with:
 *
 * - a key derived (HKDF-SHA256) from a secret every installation already has
 *   (`JWT_SECRET`) and from a `purpose` label, so no new variable exists and
 *   a key derived for one purpose is no use for another;
 * - a fresh random 96-bit IV for every encryption, and the purpose bound as
 *   additional authenticated data, so a ciphertext cannot be moved to a
 *   different purpose;
 * - a versioned format, `v1.<iv>.<tag>.<ciphertext>` (base64url), so the
 *   scheme can change without guessing what an old row holds.
 *
 * The cost of deriving from `JWT_SECRET`: changing it makes every stored
 * secret unreadable. `decryptSecret` then returns null (never throws, never
 * echoes anything) and the caller reports "not readable"; the secret is
 * entered again.
 */

const VERSION = 'v1';
const SALT = 'pmhybrid-secrets';

function deriveKey(masterSecret: string, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      masterSecret,
      SALT,
      `pmhybrid/${purpose}/${VERSION}`,
      32,
    ),
  );
}

const encode = (value: Buffer) => value.toString('base64url');

export function encryptSecret(
  plaintext: string,
  masterSecret: string,
  purpose: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    deriveKey(masterSecret, purpose),
    iv,
  );
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [
    VERSION,
    encode(iv),
    encode(cipher.getAuthTag()),
    encode(ciphertext),
  ].join('.');
}

/** The plaintext, or null when the token is malformed, of another version, or does not authenticate under this secret and purpose. */
export function decryptSecret(
  token: string,
  masterSecret: string,
  purpose: string,
): string | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    return null;
  }
  try {
    const [, iv, tag, ciphertext] = parts.map((part) =>
      Buffer.from(part, 'base64url'),
    );
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(masterSecret, purpose),
      iv,
    );
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
