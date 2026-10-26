import { describe, expect, it } from 'vitest';
import { untrackedWork, type UntrackedEvent } from './untracked-work.util.js';

const day = (n: number, hour = 10) =>
  new Date(
    `2026-10-${String(n).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`,
  );

const event = (
  taskExternalId: string,
  overrides: Partial<UntrackedEvent> = {},
): UntrackedEvent => ({
  taskExternalId,
  agentName: 'claude',
  statusWord: 'IN_PROGRESS',
  canonicalStatus: 'IN_PROGRESS',
  timestampFromLog: day(1),
  createdAt: day(20),
  ...overrides,
});

const none = new Set<string>();

describe('untrackedWork (Roadmap TASK-33)', () => {
  it('gives an ID its entries, its agents, when it was first and last seen and its last word', () => {
    const [row] = untrackedWork(
      [
        event('X-1', { agentName: 'codex', timestampFromLog: day(2) }),
        event('X-1', {
          agentName: 'claude',
          timestampFromLog: day(5),
          statusWord: 'PAUSE',
        }),
        event('X-1', {
          agentName: 'claude',
          timestampFromLog: day(9),
          statusWord: 'DONE',
        }),
      ],
      none,
    );

    expect(row).toEqual({
      externalId: 'X-1',
      entries: 3,
      agents: ['claude', 'codex'],
      firstSeen: day(2),
      lastSeen: day(9),
      lastWord: 'DONE',
      closed: true,
    });
  });

  it('leaves out an ID that is a task of the project', () => {
    const rows = untrackedWork([event('T-1'), event('X-1')], new Set(['T-1']));

    expect(rows.map((row) => row.externalId)).toEqual(['X-1']);
  });

  it('takes the latest entry by the time it says, whatever the order it came in', () => {
    const [row] = untrackedWork(
      [
        event('X-1', { statusWord: 'DONE', timestampFromLog: day(9) }),
        event('X-1', { statusWord: 'IN_PROGRESS', timestampFromLog: day(3) }),
      ],
      none,
    );

    expect(row.lastWord).toBe('DONE');
  });

  it('breaks a tie between two entries of the same time by the one read last', () => {
    const [row] = untrackedWork(
      [
        event('X-1', { statusWord: 'DONE', createdAt: day(21) }),
        event('X-1', { statusWord: 'PAUSE', createdAt: day(22) }),
      ],
      none,
    );

    expect(row.lastWord).toBe('PAUSE');
  });

  it('calls closed only the exact DONE: a partial close, a pause or another word is not', () => {
    const rows = untrackedWork(
      [
        event('X-1', {
          statusWord: 'DONE (2 de 3 partes)',
          canonicalStatus: 'DONE_PARTIAL',
        }),
        event('X-2', { statusWord: 'DONE' }),
        event('X-3', { statusWord: 'HALLAZGO', canonicalStatus: 'FINDING' }),
      ],
      none,
    );

    expect(
      Object.fromEntries(rows.map((row) => [row.externalId, row.closed])),
    ).toEqual({
      'X-1': false,
      'X-2': true,
      'X-3': false,
    });
  });

  it('puts the open ones first, then the most recent, then by ID', () => {
    const rows = untrackedWork(
      [
        event('A-closed-old', { statusWord: 'DONE', timestampFromLog: day(2) }),
        event('B-closed-new', { statusWord: 'DONE', timestampFromLog: day(8) }),
        event('C-open-old', { timestampFromLog: day(3) }),
        event('D-open-new', { timestampFromLog: day(7) }),
        event('E-open-new', { timestampFromLog: day(7) }),
      ],
      none,
    );

    expect(rows.map((row) => row.externalId)).toEqual([
      'D-open-new',
      'E-open-new',
      'C-open-old',
      'B-closed-new',
      'A-closed-old',
    ]);
  });

  it('counts an agent once however many entries it wrote', () => {
    const [row] = untrackedWork(
      [event('X-1'), event('X-1', { timestampFromLog: day(2) })],
      none,
    );

    expect(row.agents).toEqual(['claude']);
  });

  it('is empty when every ID is a task, or there are no entries', () => {
    expect(untrackedWork([event('T-1')], new Set(['T-1']))).toEqual([]);
    expect(untrackedWork([], none)).toEqual([]);
  });
});
