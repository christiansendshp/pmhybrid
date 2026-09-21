import { describe, expect, it } from 'vitest';
import { completedAtFor } from './completion-date.util.js';

describe('completedAtFor (Roadmap GAP-36d)', () => {
  const now = new Date('2026-09-21T12:00:00.000Z');

  it('sets the date when a task becomes TERMINADA', () => {
    expect(completedAtFor('QA', 'TERMINADA', now)).toBe(now);
    expect(completedAtFor('PENDIENTE', 'TERMINADA', now)).toBe(now);
    // A task first seen already done.
    expect(completedAtFor(null, 'TERMINADA', now)).toBe(now);
  });

  it('clears it when a completed task is reopened', () => {
    expect(completedAtFor('TERMINADA', 'QA', now)).toBeNull();
    expect(completedAtFor('TERMINADA', 'EN_DESARROLLO', now)).toBeNull();
  });

  it('leaves it alone for any move that does not cross the finish line', () => {
    expect(completedAtFor('PENDIENTE', 'ASIGNADA', now)).toBeUndefined();
    expect(completedAtFor('QA', 'EN_DESARROLLO', now)).toBeUndefined();
    // Staying done keeps the original date.
    expect(completedAtFor('TERMINADA', 'TERMINADA', now)).toBeUndefined();
  });
});
