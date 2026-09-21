import { describe, expect, it } from 'vitest';
import { assertLocalDatabase, isTestFixtureActor } from './fixture-actors.js';

describe('isTestFixtureActor (Roadmap IMPROVEMENT-02d)', () => {
  it.each([
    [
      'a stamped email',
      { displayName: 'Dev', email: 'developer-1789571079550@pmhybrid.local' },
    ],
    [
      'a stamp before other text',
      {
        displayName: 'Outsider',
        email: 'outsider-1789571079583-qb6rhlihz4k@pmhybrid.local',
      },
    ],
    [
      'a stamped agent name',
      { displayName: 'Key Agent-1789571079560-741620', email: null },
    ],
    ['a stamp at the end', { displayName: 'Agent-1789571102434', email: null }],
  ])('recognises %s', (_label, actor) => {
    expect(isTestFixtureActor(actor)).toBe(true);
  });

  it.each([
    [
      'the demo people',
      { displayName: 'Demo Human', email: 'demo-human@pmhybrid.local' },
    ],
    ['a person', { displayName: 'Ana García', email: 'ana@pmhybrid.local' }],
    ['an agent with no email', { displayName: 'Claude Reviewer', email: null }],
    ['a short number', { displayName: 'Team 12', email: 'team12@example.com' }],
    ['a longer number', { displayName: 'Order 17895710795501', email: null }],
  ])('leaves %s alone', (_label, actor) => {
    expect(isTestFixtureActor(actor)).toBe(false);
  });
});

describe('assertLocalDatabase', () => {
  const local = 'postgresql://u:p@localhost:5436/pmhybrid?schema=public';

  it('accepts a database on this machine', () => {
    expect(() => assertLocalDatabase({ DATABASE_URL: local })).not.toThrow();
    expect(() =>
      assertLocalDatabase({
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x',
      }),
    ).not.toThrow();
  });

  it('refuses production, another host, and a missing or unreadable address', () => {
    expect(() =>
      assertLocalDatabase({ DATABASE_URL: local, NODE_ENV: 'production' }),
    ).toThrow(/production/);
    expect(() =>
      assertLocalDatabase({
        DATABASE_URL: 'postgresql://u:p@db.example.com/x',
      }),
    ).toThrow(/db\.example\.com/);
    expect(() => assertLocalDatabase({})).toThrow(/not set/);
    expect(() => assertLocalDatabase({ DATABASE_URL: 'nonsense' })).toThrow(
      /not a URL/,
    );
  });
});
