import { describe, expect, it } from 'vitest';
import { assertSeedAllowed } from './seed-guard.js';

describe('assertSeedAllowed (Roadmap SECURITY-04a)', () => {
  it('refuses production, and says why and how to override', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(
      /Refusing to seed demo data.*SEED_ALLOW_DEMO_DATA=true/,
    );
    expect(() => assertSeedAllowed({ NODE_ENV: 'PRODUCTION' })).toThrow();
  });

  it('lets a production environment that says it is a demo one seed', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'production',
        SEED_ALLOW_DEMO_DATA: 'true',
      }),
    ).not.toThrow();
    // Anything but the literal "true" is not consent.
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_DEMO_DATA: '1' }),
    ).toThrow();
  });

  it('does not get in the way of development, test or an unset environment', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      expect(() => assertSeedAllowed({ NODE_ENV })).not.toThrow();
    }
  });
});
