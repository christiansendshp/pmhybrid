import { describe, expect, it } from 'vitest';
import { TaskCard } from './tasks.service.js';
import { countAgentWip, countInStatus, wipRatio, wipState } from './wip.js';

const card = (status: TaskCard['status'], assigneeId: string | null): TaskCard =>
  ({
    status,
    assignee: assigneeId ? { id: assigneeId, displayName: assigneeId, kind: 'AI_AGENT' } : null,
  }) as TaskCard;

describe('the advisory limits (Roadmap TASK-15)', () => {
  describe('wipState', () => {
    it('has nothing to say without a limit', () => {
      expect(wipState(9, null)).toBeNull();
      expect(wipState(9, undefined)).toBeNull();
    });

    it('is under, at and over the limit, and only over it is exceeded', () => {
      expect(wipState(2, 3)).toEqual({ count: 2, limit: 3, exceeded: false });
      expect(wipState(3, 3)).toEqual({ count: 3, limit: 3, exceeded: false });
      expect(wipState(4, 3)).toEqual({ count: 4, limit: 3, exceeded: true });
    });

    it('is exceeded even when the limit is one and there are two', () => {
      expect(wipState(2, 1)?.exceeded).toBe(true);
      expect(wipState(0, 1)?.exceeded).toBe(false);
    });
  });

  it('writes how many against how many', () => {
    expect(wipRatio({ count: 4, limit: 3, exceeded: true })).toBe('4/3');
  });

  it('counts the tasks of the project in a status, whatever is filtered', () => {
    const cards = [
      card('EN_DESARROLLO', 'a'),
      card('EN_DESARROLLO', null),
      card('QA', 'a'),
      card('TERMINADA', 'b'),
    ];

    expect(countInStatus(cards, 'EN_DESARROLLO')).toBe(2);
    expect(countInStatus(cards, 'QA')).toBe(1);
    expect(countInStatus(cards, 'PENDIENTE')).toBe(0);
  });

  it('counts the work an agent has in development, not what waits in QA or is done', () => {
    const cards = [
      card('EN_DESARROLLO', 'a'),
      card('EN_DESARROLLO', 'a'),
      card('QA', 'a'),
      card('TERMINADA', 'a'),
      card('EN_DESARROLLO', 'b'),
    ];

    expect(countAgentWip(cards, 'a')).toBe(2);
    expect(countAgentWip(cards, 'b')).toBe(1);
    expect(countAgentWip(cards, 'nobody')).toBe(0);
  });
});
