import { describe, expect, it } from 'vitest';
import { isDraggableTransition } from './task-status-policy.js';

describe('isDraggableTransition', () => {
  it('allows dragging a card forward through the board', () => {
    expect(isDraggableTransition('ASIGNADA', 'EN_DESARROLLO')).toBe(true);
    expect(isDraggableTransition('EN_DESARROLLO', 'QA')).toBe(true);
    expect(isDraggableTransition('QA', 'TERMINADA')).toBe(true);
  });

  it('allows QA rejection and reopening a terminated task', () => {
    expect(isDraggableTransition('QA', 'EN_DESARROLLO')).toBe(true);
    expect(isDraggableTransition('TERMINADA', 'EN_DESARROLLO')).toBe(true);
    expect(isDraggableTransition('TERMINADA', 'QA')).toBe(true);
  });

  it('never allows dropping into PENDIENTE or ASIGNADA — those need a deliberate assign/unassign action', () => {
    expect(isDraggableTransition('ASIGNADA', 'PENDIENTE')).toBe(false);
    expect(isDraggableTransition('EN_DESARROLLO', 'ASIGNADA')).toBe(false);
    expect(isDraggableTransition('PENDIENTE', 'ASIGNADA')).toBe(false);
  });

  it('rejects a transition the policy does not define at all', () => {
    expect(isDraggableTransition('PENDIENTE', 'TERMINADA')).toBe(false);
    expect(isDraggableTransition('QA', 'PENDIENTE')).toBe(false);
  });
});
