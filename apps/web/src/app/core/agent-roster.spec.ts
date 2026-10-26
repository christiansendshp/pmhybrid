import { describe, expect, it } from 'vitest';
import { Actor, AgentProfile } from './actors.service.js';
import { ROSTER_HEADER, agentRoster } from './agent-roster.js';

function agent(overrides: Partial<Actor> & { profile?: Partial<AgentProfile> } = {}): Actor {
  const { profile, ...actor } = overrides;
  return {
    id: 'a1',
    kind: 'AI_AGENT',
    displayName: 'Claude Sonnet',
    email: null,
    avatarUrl: null,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    agentProfile: {
      providerType: 'claude',
      configJson: null,
      model: 'Claude Sonnet 5.5',
      stageRole: 'BOTH',
      ledgerName: 'claude-sonnet-5-5',
      customLedgerName: true,
      aliases: ['claude', 'claude-sonnet-5'],
      ...profile,
    },
    ...actor,
  };
}

describe('agentRoster (Roadmap TASK-25)', () => {
  it('has the columns of the skill, in its order', () => {
    expect(ROSTER_HEADER).toBe('| Agent id | Kind | Model | Role | Aliases |');
  });

  it('writes a row for an active agent: the ledger name as id, AI, the model, the role and the aliases', () => {
    const { table } = agentRoster([agent()]);

    expect(table.split('\n')).toEqual([
      '| Agent id | Kind | Model | Role | Aliases |',
      '|---|---|---|---|---|',
      '| claude-sonnet-5-5 | AI | Claude Sonnet 5.5 | BOTH | claude, claude-sonnet-5 |',
    ]);
  });

  it('uses the display name as the id of an agent that chose no ledger name', () => {
    const { table } = agentRoster([agent({ profile: { ledgerName: undefined } })]);

    expect(table).toContain('| Claude Sonnet | AI |');
  });

  it('says nothing with a dash where an agent has no model or no aliases, and takes its role as it is', () => {
    const { table } = agentRoster([
      agent({ profile: { model: null, aliases: [], stageRole: 'QA' } }),
    ]);

    expect(table.split('\n')[2]).toBe('| claude-sonnet-5-5 | AI | — | QA | — |');
  });

  it('leaves out people, agents switched off and actors with no profile', () => {
    const { table, rows } = agentRoster([
      agent({ id: 'h', kind: 'HUMAN', displayName: 'Ana' }),
      agent({ id: 'off', isActive: false, displayName: 'Retired' }),
      agent({ id: 'bare', agentProfile: null, displayName: 'Bare' }),
    ]);

    expect(table).toBe('');
    expect(rows).toBe(0);
  });

  it('makes a row for each active agent, in the order it was given', () => {
    const { table, rows } = agentRoster([
      agent({ displayName: 'Zed', profile: { ledgerName: 'zed', aliases: [] } }),
      agent({ displayName: 'Amy', profile: { ledgerName: 'amy', aliases: [] } }),
    ]);

    expect(rows).toBe(2);
    expect(table.split('\n').slice(2)).toEqual([
      '| zed | AI | Claude Sonnet 5.5 | BOTH | — |',
      '| amy | AI | Claude Sonnet 5.5 | BOTH | — |',
    ]);
  });

  describe('a name that would break the table never reaches it', () => {
    it('leaves out an agent whose id holds a pipe, and says which', () => {
      const { table, left } = agentRoster([
        agent({ displayName: 'Bad', profile: { ledgerName: 'a|b' } }),
        agent({ displayName: 'Good', profile: { ledgerName: 'good' } }),
      ]);

      expect(table).not.toContain('a|b');
      expect(table.split('\n')).toHaveLength(3);
      expect(left).toEqual(['Bad: su nombre en el registro no cabe en una tabla.']);
    });

    it('leaves out an agent whose id holds a line break', () => {
      const { rows, left } = agentRoster([agent({ profile: { ledgerName: 'two\nlines' } })]);

      expect(rows).toBe(0);
      expect(left).toHaveLength(1);
    });

    it('leaves out an alias with a pipe, a line break or a comma, and keeps the others', () => {
      const { table, left } = agentRoster([
        agent({ profile: { aliases: ['ok', 'x|y', 'multi\nline', 'a,b'] } }),
      ]);

      expect(table.split('\n')[2]).toBe(
        '| claude-sonnet-5-5 | AI | Claude Sonnet 5.5 | BOTH | ok |',
      );
      expect(left).toHaveLength(3);
    });

    it('shows a model that would break the table as none', () => {
      const { table, left } = agentRoster([agent({ profile: { model: 'a|b' } })]);

      expect(table.split('\n')[2]).toContain('| AI | — | BOTH |');
      expect(left).toEqual(['claude-sonnet-5-5: el modelo no cabe en una tabla.']);
    });

    it('trims the spaces around a name', () => {
      const { table } = agentRoster([
        agent({ profile: { ledgerName: '  spaced  ', aliases: [' pad '] } }),
      ]);

      expect(table.split('\n')[2]).toContain('| spaced | AI |');
      expect(table.split('\n')[2]).toContain('| pad |');
    });
  });
});
