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

describe('SYNC_RUN_RETENTION (Roadmap TASK-50)', () => {
  const base = { DATABASE_URL: 'postgres://db', JWT_SECRET: 'change-me' };

  it('keeps 500 runs of each project when nothing is set, or only spaces', () => {
    expect([
      validateEnv(base).SYNC_RUN_RETENTION,
      validateEnv({ ...base, SYNC_RUN_RETENTION: '  ' }).SYNC_RUN_RETENTION,
    ]).toEqual([500, 500]);
  });

  it('takes a whole number, and 0 for "keep them all"', () => {
    expect([
      validateEnv({ ...base, SYNC_RUN_RETENTION: '50' }).SYNC_RUN_RETENTION,
      validateEnv({ ...base, SYNC_RUN_RETENTION: '0' }).SYNC_RUN_RETENTION,
    ]).toEqual([50, 0]);
  });

  it.each([['-1'], ['2.5'], ['many'], ['1e3x']])(
    'stops the start on %j and names the variable',
    (bad) => {
      expect(() => validateEnv({ ...base, SYNC_RUN_RETENTION: bad })).toThrow(
        /SYNC_RUN_RETENTION must be a whole number of sync runs to keep/,
      );
    },
  );

  it('does not let the revision retention take its value, nor the other way round', () => {
    const env = validateEnv({
      ...base,
      DOCUMENT_REVISION_RETENTION: '7',
      SYNC_RUN_RETENTION: '9',
    });

    expect([env.DOCUMENT_REVISION_RETENTION, env.SYNC_RUN_RETENTION]).toEqual([
      7, 9,
    ]);
  });
});

describe('NOTIFICATION_RETENTION_DAYS (Roadmap TASK-51)', () => {
  const base = { DATABASE_URL: 'postgres://db', JWT_SECRET: 'change-me' };

  it('keeps a read notification 90 days when nothing is set, or only spaces', () => {
    expect([
      validateEnv(base).NOTIFICATION_RETENTION_DAYS,
      validateEnv({ ...base, NOTIFICATION_RETENTION_DAYS: ' ' })
        .NOTIFICATION_RETENTION_DAYS,
    ]).toEqual([90, 90]);
  });

  it('takes a whole number of days, and 0 for "keep them all"', () => {
    expect([
      validateEnv({ ...base, NOTIFICATION_RETENTION_DAYS: '30' })
        .NOTIFICATION_RETENTION_DAYS,
      validateEnv({ ...base, NOTIFICATION_RETENTION_DAYS: '0' })
        .NOTIFICATION_RETENTION_DAYS,
    ]).toEqual([30, 0]);
  });

  it.each([['-1'], ['1.5'], ['soon'], ['7d']])(
    'stops the start on %j and names the variable',
    (bad) => {
      expect(() =>
        validateEnv({ ...base, NOTIFICATION_RETENTION_DAYS: bad }),
      ).toThrow(
        /NOTIFICATION_RETENTION_DAYS must be a whole number of days to keep/,
      );
    },
  );
});
