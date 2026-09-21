import { describe, expect, it } from 'vitest';
import type { Actor } from './actors.service.js';
import { filterActors } from './actor-filter.js';

function actor(overrides: Partial<Actor>): Actor {
  return {
    id: overrides.displayName ?? 'a',
    kind: 'HUMAN',
    displayName: 'Someone',
    email: null,
    avatarUrl: null,
    isActive: true,
    createdAt: '2026-09-15T09:00:00.000Z',
    ...overrides,
  };
}

const TEAM = [
  actor({ displayName: 'Ana García', email: 'ana@pmhybrid.local' }),
  actor({ displayName: 'Demo Human', email: 'demo-human@pmhybrid.local' }),
  actor({
    displayName: 'Codex',
    kind: 'AI_AGENT',
    agentProfile: { providerType: 'openai', configJson: null },
  }),
];

const names = (actors: Actor[]) => actors.map((a) => a.displayName);

describe('filterActors (Roadmap UX-03c3)', () => {
  it('keeps everyone for an empty or blank query', () => {
    expect(names(filterActors(TEAM, ''))).toEqual(['Ana García', 'Demo Human', 'Codex']);
    expect(names(filterActors(TEAM, '   '))).toHaveLength(3);
  });

  it('matches by name, ignoring case and accents', () => {
    expect(names(filterActors(TEAM, 'garcia'))).toEqual(['Ana García']);
    expect(names(filterActors(TEAM, 'DEMO'))).toEqual(['Demo Human']);
  });

  it('matches by email and by an agent provider', () => {
    expect(names(filterActors(TEAM, 'demo-human@'))).toEqual(['Demo Human']);
    expect(names(filterActors(TEAM, 'openai'))).toEqual(['Codex']);
  });

  it('needs every word, in any order', () => {
    expect(names(filterActors(TEAM, 'garcia ana'))).toEqual(['Ana García']);
    expect(filterActors(TEAM, 'ana codex')).toEqual([]);
  });

  it('does not change the list it was given', () => {
    const copy = filterActors(TEAM, '');
    copy.pop();

    expect(TEAM).toHaveLength(3);
  });
});
