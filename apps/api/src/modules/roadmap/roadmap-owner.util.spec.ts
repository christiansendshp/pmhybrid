import { describe, expect, it } from 'vitest';
import {
  normalizeOwnerName,
  ownerCell,
  ownerNameFromRaw,
  resolveOwner,
  type OwnerCandidate,
} from './roadmap-owner.util.js';

const ana: OwnerCandidate = {
  actorId: 'a1',
  displayName: 'Ana García',
  kind: 'HUMAN',
};
const claude: OwnerCandidate = {
  actorId: 'a2',
  displayName: 'Claude',
  kind: 'AI_AGENT',
};

describe('resolveOwner (Roadmap GAP-35a)', () => {
  it('matches one candidate by name, ignoring case and extra whitespace', () => {
    expect(resolveOwner([ana, claude], '  ana   GARCÍA ')).toEqual({
      status: 'MATCHED',
      actorId: 'a1',
    });
  });

  it('does not fold accents: two names that differ by one are two people', () => {
    expect(resolveOwner([ana], 'Ana Garcia').status).toBe('NONE');
  });

  it('narrows by kind: an agent entry never resolves to a person of the same name', () => {
    const personCalledClaude: OwnerCandidate = {
      actorId: 'a3',
      displayName: 'Claude',
      kind: 'HUMAN',
    };
    expect(
      resolveOwner([personCalledClaude, claude], 'claude', 'AI_AGENT'),
    ).toEqual({ status: 'MATCHED', actorId: 'a2' });
    expect(
      resolveOwner([personCalledClaude, claude], 'claude', 'HUMAN'),
    ).toEqual({ status: 'MATCHED', actorId: 'a3' });
  });

  it('is ambiguous — never an arbitrary pick — when several match', () => {
    const other: OwnerCandidate = { ...ana, actorId: 'a9' };
    expect(resolveOwner([ana, other], 'Ana García')).toEqual({
      status: 'AMBIGUOUS',
    });
    // With no kind the old tables search both, so a person and an agent of one name collide too.
    const collides: OwnerCandidate = {
      ...claude,
      actorId: 'a8',
      kind: 'HUMAN',
    };
    expect(resolveOwner([collides, claude], 'Claude').status).toBe('AMBIGUOUS');
  });

  it('finds nobody for an unknown or empty name', () => {
    expect(resolveOwner([ana, claude], 'Nobody').status).toBe('NONE');
    expect(resolveOwner([ana, claude], '   ').status).toBe('NONE');
  });
});

describe('owner text helpers', () => {
  it('renders the old Owner cell: agent with claim time, person bare, nobody as a placeholder', () => {
    const at = '2026-09-21T10:00:00.000Z';
    expect(ownerCell({ name: 'claude', kind: 'AI_AGENT' }, at)).toBe(
      `claude@${at}`,
    );
    expect(ownerCell({ name: 'Ana', kind: 'HUMAN' }, at)).toBe('Ana');
    expect(ownerCell(null, at)).toBe('—');
  });

  it('reads the name back out of a stored raw owner, dropping only a real timestamp', () => {
    expect(ownerNameFromRaw('claude@2026-09-21T10:00:00Z')).toBe('claude');
    expect(ownerNameFromRaw('Ana García')).toBe('Ana García');
    expect(ownerNameFromRaw('ana@example.com')).toBe('ana@example.com');
    expect(ownerNameFromRaw(null)).toBeUndefined();
    expect(ownerNameFromRaw('  ')).toBeUndefined();
  });

  it('normalizes names for comparison', () => {
    expect(normalizeOwnerName('  Ana\tGarcía ')).toBe('ana garcía');
  });
});
