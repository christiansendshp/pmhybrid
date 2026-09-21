import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { ConflictsService } from './conflicts.service.js';

/**
 * Resolving a conflict needs `conflict.resolve` on the route (covered in
 * conflicts.e2e-spec.ts), but that must not become a way around the rules
 * of the change it applies (Roadmap SECURITY-02). No seeded role holds
 * `conflict.resolve` without also holding the permissions below, so this is
 * exercised with a stubbed permission set.
 */
function setup(options: {
  held: string[];
  taskStatus: string;
  kind?: string;
  localVersion?: object;
  externalVersion?: object;
  /** The task changed after it was read, so the guarded update matches nothing. */
  staleTask?: boolean;
  currentAssignee?: string | null;
  /** What the membership lookup finds for the assignee being applied; default is an active member. */
  member?: { isActive: boolean; actor: { isActive: boolean } } | null;
}) {
  const conflict = {
    id: 'c1',
    projectId: 'p1',
    entityType: 'Task',
    entityId: 't1',
    kind: options.kind ?? 'CONCURRENT_FIELD_EDIT',
    localVersion: options.localVersion ?? { status: 'ASIGNADA' },
    externalVersion: options.externalVersion ?? { status: 'TERMINADA' },
    resolvedAt: null,
  };
  const taskUpdate = vi
    .fn()
    .mockResolvedValue({ count: options.staleTask ? 0 : 1 });
  const conflictUpdate = vi.fn().mockResolvedValue({ id: 'c1' });
  const tx = {
    task: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        status: options.taskStatus,
        assigneeActorId: options.currentAssignee ?? null,
      }),
      updateMany: taskUpdate,
    },
    conflict: { update: conflictUpdate },
    projectMember: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          options.member === undefined
            ? { isActive: true, actor: { isActive: true } }
            : options.member,
        ),
    },
    taskAssignment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    conflict: { findFirst: vi.fn().mockResolvedValue(conflict) },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaService;
  const record = vi.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const resolver = {
    hasPermission: (_actor: string, permission: string) =>
      Promise.resolve(options.held.includes(permission)),
  } as unknown as PermissionsResolverService;
  return {
    service: new ConflictsService(prisma, audit, resolver),
    taskUpdate,
    conflictUpdate,
    record,
    assignmentCreate: tx.taskAssignment.create,
  };
}

describe('ConflictsService.resolve permissions (Roadmap SECURITY-02)', () => {
  it('refuses to apply TERMINADA without task.qa.approve and changes nothing', async () => {
    const { service, taskUpdate, conflictUpdate, record } = setup({
      held: ['task.status.transition', 'task.write', 'task.assign'],
      taskStatus: 'ASIGNADA',
    });

    await expect(
      service.resolve(
        'p1',
        'c1',
        { strategy: 'KEEP_EXTERNAL' } as never,
        'actor-1',
      ),
    ).rejects.toThrow(
      new ForbiddenException('Missing permission: task.qa.approve'),
    );
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(conflictUpdate).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('applies TERMINADA when the actor holds task.qa.approve, auditing STATUS_CHANGE too', async () => {
    const { service, taskUpdate, record } = setup({
      held: ['task.qa.approve'],
      taskStatus: 'ASIGNADA',
    });

    await service.resolve(
      'p1',
      'c1',
      { strategy: 'KEEP_EXTERNAL' } as never,
      'actor-1',
      'UI',
    );

    expect(taskUpdate).toHaveBeenCalledWith({
      where: { id: 't1', deletedAt: null, status: 'ASIGNADA' },
      data: { status: 'TERMINADA' },
    });
    const operations = record.mock.calls.map(([event]) => event.operation);
    expect(operations).toEqual(['STATUS_CHANGE', 'CONFLICT_RESOLVED']);
    expect(record.mock.calls[0][0]).toMatchObject({
      entityId: 't1',
      previousValue: { status: 'ASIGNADA' },
      newValue: { status: 'TERMINADA' },
      actorId: 'actor-1',
    });
  });

  it('holds a legal single step to that step’s own permission (QA -> TERMINADA needs approve, not transition)', async () => {
    const { service } = setup({
      held: ['task.status.transition', 'task.reopen'],
      taskStatus: 'QA',
    });

    await expect(
      service.resolve(
        'p1',
        'c1',
        { strategy: 'KEEP_EXTERNAL' } as never,
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('needs task.write to apply any non-status field', async () => {
    const denied = setup({
      held: ['task.status.transition'],
      taskStatus: 'ASIGNADA',
      localVersion: { title: 'Mine' },
      externalVersion: { title: 'Theirs' },
    });
    await expect(
      denied.service.resolve(
        'p1',
        'c1',
        { strategy: 'KEEP_EXTERNAL' } as never,
        'actor-1',
      ),
    ).rejects.toThrow(new ForbiddenException('Missing permission: task.write'));

    const allowed = setup({
      held: ['task.write'],
      taskStatus: 'ASIGNADA',
      localVersion: { title: 'Mine' },
      externalVersion: { title: 'Theirs' },
    });
    await allowed.service.resolve(
      'p1',
      'c1',
      { strategy: 'KEEP_EXTERNAL' } as never,
      'actor-1',
    );
    expect(allowed.taskUpdate).toHaveBeenCalledWith({
      where: { id: 't1', deletedAt: null, status: 'ASIGNADA' },
      data: { title: 'Theirs' },
    });
    // No status change, so no STATUS_CHANGE event.
    expect(allowed.record.mock.calls.map(([event]) => event.operation)).toEqual(
      ['CONFLICT_RESOLVED'],
    );
  });

  it('needs no task permission when the resolution applies nothing (KEEP_LOCAL, DISMISSED)', async () => {
    for (const strategy of ['KEEP_LOCAL', 'DISMISSED']) {
      const { service, taskUpdate, conflictUpdate } = setup({
        held: [],
        taskStatus: 'ASIGNADA',
      });
      await service.resolve('p1', 'c1', { strategy } as never, 'actor-1');
      expect(taskUpdate).not.toHaveBeenCalled();
      expect(conflictUpdate).toHaveBeenCalled();
    }
  });

  it('answers 409 and resolves nothing when the task changed after it was read (Roadmap BUG-04)', async () => {
    const { service, conflictUpdate, record } = setup({
      held: ['task.qa.approve'],
      taskStatus: 'ASIGNADA',
      staleTask: true,
    });

    await expect(
      service.resolve(
        'p1',
        'c1',
        { strategy: 'KEEP_EXTERNAL' } as never,
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(conflictUpdate).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('ConflictsService.resolve assignee (Roadmap GAP-35a)', () => {
  const assigneeConflict = {
    kind: 'CONCURRENT_FIELD_EDIT',
    localVersion: { assigneeActorId: 'u1' },
    externalVersion: { assigneeActorId: 'u2' },
  };
  const keepExternal = { strategy: 'KEEP_EXTERNAL' } as never;

  it('needs task.assign, not task.write, and records the reassignment like any other', async () => {
    const { service, taskUpdate, assignmentCreate, record } = setup({
      held: ['task.assign'],
      taskStatus: 'ASIGNADA',
      currentAssignee: 'u1',
      ...assigneeConflict,
    });

    await service.resolve('p1', 'c1', keepExternal, 'actor-1');

    expect(taskUpdate).toHaveBeenCalledWith({
      where: {
        id: 't1',
        deletedAt: null,
        status: 'ASIGNADA',
        assigneeActorId: 'u1',
      },
      data: { assigneeActorId: 'u2' },
    });
    expect(assignmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 't1',
        actorId: 'u2',
        assignedByActorId: 'actor-1',
      }),
    });
    expect(record.mock.calls.map(([event]) => event.operation)).toEqual([
      'REASSIGN',
      'CONFLICT_RESOLVED',
    ]);
  });

  it('refuses without task.assign, and needs the locked-reassign key once the task is EN_DESARROLLO', async () => {
    const withoutAssign = setup({
      held: ['task.write'],
      taskStatus: 'ASIGNADA',
      currentAssignee: 'u1',
      ...assigneeConflict,
    });
    await expect(
      withoutAssign.service.resolve('p1', 'c1', keepExternal, 'actor-1'),
    ).rejects.toThrow(
      new ForbiddenException('Missing permission: task.assign'),
    );

    const locked = setup({
      held: ['task.assign'],
      taskStatus: 'EN_DESARROLLO',
      currentAssignee: 'u1',
      ...assigneeConflict,
    });
    await expect(
      locked.service.resolve('p1', 'c1', keepExternal, 'actor-1'),
    ).rejects.toThrow(
      new ForbiddenException('Missing permission: task.reassign.locked'),
    );
    expect(locked.taskUpdate).not.toHaveBeenCalled();
  });

  it('refuses an assignee who is no longer an active member, changing nothing', async () => {
    for (const member of [
      null,
      { isActive: false, actor: { isActive: true } },
      { isActive: true, actor: { isActive: false } },
    ]) {
      const { service, taskUpdate, conflictUpdate } = setup({
        held: ['task.assign'],
        taskStatus: 'ASIGNADA',
        currentAssignee: 'u1',
        member,
        ...assigneeConflict,
      });
      await expect(
        service.resolve('p1', 'c1', keepExternal, 'actor-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(taskUpdate).not.toHaveBeenCalled();
      expect(conflictUpdate).not.toHaveBeenCalled();
    }
  });
});

describe('ConflictsService.resolve unrecognized status (Roadmap GAP-35b)', () => {
  const unrecognized = {
    kind: 'UNRECOGNIZED_STATUS',
    localVersion: { status: 'ASIGNADA' },
    externalVersion: { statusRaw: 'WIP' },
  };

  it('has no document value to keep: KEEP_EXTERNAL is a 400 and changes nothing', async () => {
    const { service, taskUpdate, conflictUpdate } = setup({
      held: ['task.qa.approve', 'task.write', 'task.status.transition'],
      taskStatus: 'ASIGNADA',
      ...unrecognized,
    });

    await expect(
      service.resolve(
        'p1',
        'c1',
        { strategy: 'KEEP_EXTERNAL' } as never,
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(conflictUpdate).not.toHaveBeenCalled();
  });

  it('lets a person choose a valid status, held to the permission of that move', async () => {
    const allowed = setup({
      held: ['task.status.transition'],
      taskStatus: 'ASIGNADA',
      ...unrecognized,
    });
    await allowed.service.resolve(
      'p1',
      'c1',
      {
        strategy: 'MANUAL_EDIT',
        manualValue: { status: 'EN_DESARROLLO' },
      } as never,
      'actor-1',
    );
    expect(allowed.taskUpdate).toHaveBeenCalledWith({
      where: { id: 't1', deletedAt: null, status: 'ASIGNADA' },
      data: { status: 'EN_DESARROLLO' },
    });

    const denied = setup({ held: [], taskStatus: 'ASIGNADA', ...unrecognized });
    await expect(
      denied.service.resolve(
        'p1',
        'c1',
        {
          strategy: 'MANUAL_EDIT',
          manualValue: { status: 'EN_DESARROLLO' },
        } as never,
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot be used to set the raw token: only contested, editable fields are accepted', async () => {
    const { service, taskUpdate } = setup({
      held: ['task.write'],
      taskStatus: 'ASIGNADA',
      ...unrecognized,
    });
    await expect(
      service.resolve(
        'p1',
        'c1',
        { strategy: 'MANUAL_EDIT', manualValue: { statusRaw: 'QA' } } as never,
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(taskUpdate).not.toHaveBeenCalled();
  });
});

describe('ConflictsService.resolve of a disappeared row (Roadmap BUG-06a)', () => {
  const disappeared = {
    kind: 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG',
    localVersion: { externalId: 'PMH-5', status: 'ASIGNADA' },
    externalVersion: undefined,
  };

  it('records that the task has no row when it is kept or dismissed, so the sweep does not ask again — with no task permission', async () => {
    for (const strategy of ['KEEP_LOCAL', 'DISMISSED']) {
      const { service, taskUpdate } = setup({
        held: [],
        taskStatus: 'ASIGNADA',
        ...disappeared,
      });

      await service.resolve('p1', 'c1', { strategy } as never, 'actor-1');

      expect(taskUpdate).toHaveBeenCalledWith({
        where: { id: 't1', deletedAt: null },
        data: { roadmapTable: null },
      });
    }
  });

  it('leaves the table alone for any other kind of conflict', async () => {
    const { service, taskUpdate } = setup({
      held: [],
      taskStatus: 'ASIGNADA',
    });

    await service.resolve(
      'p1',
      'c1',
      { strategy: 'KEEP_LOCAL' } as never,
      'actor-1',
    );

    expect(taskUpdate).not.toHaveBeenCalled();
  });
});
