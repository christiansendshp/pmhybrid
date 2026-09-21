import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@pmhybrid/shared-types';
import {
  findTransitionRule,
  isAssigneeLocked,
  permissionForStatusChange,
} from './task-status-policy.js';

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

  describe('permissionForStatusChange (conflict resolution, Roadmap SECURITY-02)', () => {
    it('keeps the transition rule permission for a legal single step', () => {
      expect(
        permissionForStatusChange(TaskStatus.QA, TaskStatus.TERMINADA),
      ).toBe('task.qa.approve');
      expect(
        permissionForStatusChange(TaskStatus.PENDIENTE, TaskStatus.ASIGNADA),
      ).toBe('task.assign');
    });

    it('needs QA approval for any jump into TERMINADA', () => {
      expect(
        permissionForStatusChange(TaskStatus.ASIGNADA, TaskStatus.TERMINADA),
      ).toBe('task.qa.approve');
      expect(
        permissionForStatusChange(TaskStatus.PENDIENTE, TaskStatus.TERMINADA),
      ).toBe('task.qa.approve');
    });

    it('needs reopen for any jump out of TERMINADA', () => {
      expect(
        permissionForStatusChange(TaskStatus.TERMINADA, TaskStatus.PENDIENTE),
      ).toBe('task.reopen');
    });

    it('needs plain transition rights for any other jump', () => {
      expect(
        permissionForStatusChange(TaskStatus.PENDIENTE, TaskStatus.QA),
      ).toBe('task.status.transition');
    });
  });
});
