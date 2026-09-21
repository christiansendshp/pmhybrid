import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';
import { weakJwtSecretReason } from './secret-strength.js';

describe('JWT secret strength (Roadmap SECURITY-04a)', () => {
  it('rejects a short secret and a known placeholder, and accepts a long random one', () => {
    expect(weakJwtSecretReason('change-me')).toMatch(/9 characters/);
    expect(weakJwtSecretReason('x'.repeat(31))).toMatch(/31 characters/);
    expect(weakJwtSecretReason('CHANGE-ME'.padEnd(40, ' '))).toBe(
      'it is a known placeholder',
    );
    expect(
      weakJwtSecretReason('k3Jp9wX2vQ8mZr5tYb1nHc7LdF4sGa6UeO0iWx3Nj5Rq'),
    ).toBeNull();
  });

  const base = { DATABASE_URL: 'postgres://db' };

  it('refuses to start in production with a weak secret', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'change-me' }),
    ).toThrow(/JWT_SECRET is too weak/);
  });

  it('starts in production with a strong one', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: 'production',
      JWT_SECRET: 'k3Jp9wX2vQ8mZr5tYb1nHc7LdF4sGa6UeO0iWx3Nj5Rq',
    });
    expect(env.JWT_SECRET).toHaveLength(44);
  });

  it('does not stop development, test or CI on a placeholder (they get a warning instead)', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      expect(() =>
        validateEnv({ ...base, NODE_ENV, JWT_SECRET: 'change-me' }),
      ).not.toThrow();
    }
  });
});
