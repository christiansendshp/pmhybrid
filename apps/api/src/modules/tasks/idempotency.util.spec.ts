import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseIdempotencyKey, requestFingerprint } from './idempotency.util.js';

describe('parseIdempotencyKey (Roadmap BUG-07b)', () => {
  it('has nothing to say when the client sent no key', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
  });

  it('accepts a UUID or any opaque printable token, trimmed', () => {
    expect(parseIdempotencyKey('7b0f9f4e-3c2a-4a8e-9d55-0d3a6c1f2b10')).toBe(
      '7b0f9f4e-3c2a-4a8e-9d55-0d3a6c1f2b10',
    );
    expect(parseIdempotencyKey('  retry:42_a.b~c  ')).toBe('retry:42_a.b~c');
    expect(parseIdempotencyKey('k'.repeat(128))).toHaveLength(128);
  });

  it('refuses a key that is empty, too long, or has a space or a control character in it', () => {
    for (const bad of ['', '   ', 'k'.repeat(129), 'two words', 'tab\there']) {
      expect(() => parseIdempotencyKey(bad)).toThrow(BadRequestException);
    }
  });

  it('refuses a header repeated with several values instead of guessing which one', () => {
    expect(() => parseIdempotencyKey(['a', 'b'])).toThrow(BadRequestException);
  });
});

describe('requestFingerprint (Roadmap BUG-07b)', () => {
  it('is the same for the same request whatever the key order or the undefined fields', () => {
    expect(requestFingerprint({ title: 'A', acceptanceCriteria: 'c' })).toBe(
      requestFingerprint({
        acceptanceCriteria: 'c',
        phaseId: undefined,
        title: 'A',
      }),
    );
  });

  it('differs when anything the request asked for differs', () => {
    const base = requestFingerprint({ title: 'A', acceptanceCriteria: 'c' });

    expect(
      requestFingerprint({ title: 'B', acceptanceCriteria: 'c' }),
    ).not.toBe(base);
    expect(
      requestFingerprint({ title: 'A', acceptanceCriteria: 'c', phaseId: 'p' }),
    ).not.toBe(base);
  });
});
