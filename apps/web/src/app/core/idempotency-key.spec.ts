import { afterEach, describe, expect, it, vi } from 'vitest';
import { newIdempotencyKey } from './idempotency-key';

describe('newIdempotencyKey (Roadmap BUG-07b)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes a different key each time, of a shape the API accepts (1-128 printable characters, no spaces)', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));

    expect(keys.size).toBe(50);
    for (const key of keys) {
      expect(key).toMatch(/^[\x21-\x7e]{1,128}$/);
    }
  });

  it('still makes a key where crypto.randomUUID does not exist (a page served over plain http)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(171),
    });
    expect(newIdempotencyKey()).toBe('ab'.repeat(16));

    vi.stubGlobal('crypto', undefined);
    expect(newIdempotencyKey()).toMatch(/^[0-9a-f]{32}$/);
  });
});
