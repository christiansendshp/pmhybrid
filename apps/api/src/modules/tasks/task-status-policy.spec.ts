import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@pmhybrid/shared-types';
import { findTransitionRule, isAssigneeLocked } from './task-status-policy.js';

describe('task-status-policy', () => {
  it('allows PENDIENTE -> ASIGNADA via task.assign', () => {
    const rule = findTransitionRule(TaskStatus.PENDIENTE, TaskStatus.ASIGNADA);
    expect(rule?.requiredPermission).toBe('task.assign');
  });

  it('has no rule for skipping straight to TERMINADA from PENDIENTE', () => {
    expect(
      findTransitionRule(TaskStatus.PENDIENTE, TaskStatus.TERMINADA),
    ).toBeUndefined();
  });

  it('locks the assignee only while EN_DESARROLLO', () => {
    expect(isAssigneeLocked(TaskStatus.EN_DESARROLLO)).toBe(true);
    expect(isAssigneeLocked(TaskStatus.QA)).toBe(false);
  });
});
