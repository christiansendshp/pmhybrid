import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

describe('DOCUMENT_REVISION_RETENTION (Roadmap BUG-07c)', () => {
  const base = { DATABASE_URL: 'postgres://db', JWT_SECRET: 'change-me' };

  it('keeps 200 revisions of each document when nothing is set', () => {
    expect(validateEnv(base).DOCUMENT_REVISION_RETENTION).toBe(200);
    expect(
      validateEnv({ ...base, DOCUMENT_REVISION_RETENTION: '  ' })
        .DOCUMENT_REVISION_RETENTION,
    ).toBe(200);
  });

  it('takes a whole number, and 0 for "keep them all"', () => {
    expect(
      validateEnv({ ...base, DOCUMENT_REVISION_RETENTION: '50' })
        .DOCUMENT_REVISION_RETENTION,
    ).toBe(50);
    expect(
      validateEnv({ ...base, DOCUMENT_REVISION_RETENTION: '0' })
        .DOCUMENT_REVISION_RETENTION,
    ).toBe(0);
  });

  it('stops the start on anything else instead of deleting the wrong amount', () => {
    for (const bad of ['-1', '2.5', 'many', '1e3x']) {
      expect(() =>
        validateEnv({ ...base, DOCUMENT_REVISION_RETENTION: bad }),
      ).toThrow(/DOCUMENT_REVISION_RETENTION must be a whole number/);
    }
  });
});
