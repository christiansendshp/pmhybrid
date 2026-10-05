import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret-crypto.util.js';

const MASTER = 'a-long-enough-master-secret-for-the-tests-0123456789';
const PURPOSE = 'llm-api-key';
const KEY = 'sk-ant-api03-EXAMPLE-not-a-real-key-ÅÄÖ';

describe('secret-crypto.util (Roadmap GAP-39a)', () => {
  it('round-trips a secret, whatever characters it holds', () => {
    const token = encryptSecret(KEY, MASTER, PURPOSE);

    expect(decryptSecret(token, MASTER, PURPOSE)).toBe(KEY);
  });

  it('never holds the plaintext, and differs on every encryption', () => {
    const first = encryptSecret(KEY, MASTER, PURPOSE);
    const second = encryptSecret(KEY, MASTER, PURPOSE);

    expect(first).not.toContain('sk-ant');
    expect(
      Buffer.from(first.split('.')[3], 'base64url').toString('utf8'),
    ).not.toContain('sk-ant');
    expect(first).not.toBe(second);
    expect(first.startsWith('v1.')).toBe(true);
  });

  it('is unreadable under another master secret (JWT_SECRET changed)', () => {
    const token = encryptSecret(KEY, MASTER, PURPOSE);

    expect(decryptSecret(token, `${MASTER}-rotated`, PURPOSE)).toBeNull();
  });

  it('is unreadable for another purpose', () => {
    const token = encryptSecret(KEY, MASTER, PURPOSE);

    expect(decryptSecret(token, MASTER, 'something-else')).toBeNull();
  });

  it('is unreadable once any part is altered', () => {
    const [version, iv, tag, ciphertext] = encryptSecret(
      KEY,
      MASTER,
      PURPOSE,
    ).split('.');
    const flipped = Buffer.from(ciphertext, 'base64url');
    flipped[0] ^= 0xff;

    expect(
      decryptSecret(
        [version, iv, tag, flipped.toString('base64url')].join('.'),
        MASTER,
        PURPOSE,
      ),
    ).toBeNull();
    expect(
      decryptSecret(
        [version, iv, Buffer.alloc(16).toString('base64url'), ciphertext].join(
          '.',
        ),
        MASTER,
        PURPOSE,
      ),
    ).toBeNull();
  });

  it('answers null, not an exception, for anything that is not a token', () => {
    for (const bad of ['', 'plain-text-key', 'v1.a.b', 'v2.a.b.c', 'v1....']) {
      expect(decryptSecret(bad, MASTER, PURPOSE)).toBeNull();
    }
  });
});
