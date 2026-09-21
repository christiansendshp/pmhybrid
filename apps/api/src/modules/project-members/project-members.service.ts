import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskStatus, type AuditOrigin } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Adding an AI_AGENT actor as a member works identically to a HUMAN one
 * (brief §3/§18) — this service only cares that the Actor id exists, not
 * its kind.
 */
@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAllForProject(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId, isActive: true },
      include: {
        actor: {
          select: { id: true, displayName: true, kind: true, email: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /** Idempotent: an already active member is returned as-is, with no audit entry. */
  async addMember(
    projectId: string,
    actorId: string,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    const actor = await this.prisma.actor.findUnique({
      where: { id: actorId },
    });
    if (!actor) {
      throw new BadRequestException('No such actor');
    }
    if (!actor.isActive) {
      throw new BadRequestException('Inactive actors cannot join a project');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
    });
    if (existing?.isActive) {
      return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      // Re-activate rather than duplicate, if they'd been removed before.
      const member = existing
        ? await tx.projectMember.update({
            where: { id: existing.id },
            data: { isActive: true },
          })
        : await tx.projectMember.create({ data: { projectId, actorId } });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'ProjectMember',
          entityId: member.id,
          operation: 'MEMBER_ADD',
          origin,
          newValue: {
            actorId,
            displayName: actor.displayName,
            kind: actor.kind,
          },
        },
        tx,
      );
      return member;
    });
  }

  /**
   * Soft-delete (isActive=false), matching Project/Task's no-hard-delete
   * convention (docs/domain-model.md) — and the rest of what a member holds
   * in this project goes with them, in the same transaction (Roadmap BUG-08):
   *
   * - their project-scoped roles are revoked, so re-adding them does not
   *   silently give back every role they had (global roles are theirs, not
   *   this project's, and stay);
   * - their open tasks are unassigned, one audit event each: an ASIGNADA task
   *   goes back to PENDIENTE (ASIGNADA means "has an assignee"), one already
   *   in progress keeps its status and is left for someone to pick up. The
   *   removal is not refused instead, because off-boarding someone who holds
   *   a locked EN_DESARROLLO task would otherwise be impossible;
   * - if they were the project's lead, the project has no lead until one is set.
   */
  async removeMember(
    projectId: string,
    actorId: string,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
      include: { actor: { select: { displayName: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Not a member of this project');
    }
    if (!existing.isActive) {
      return existing;
    }
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'ProjectMember',
          entityId: member.id,
          operation: 'MEMBER_REMOVE',
          origin,
          previousValue: {
            actorId,
            displayName: existing.actor.displayName,
            isActive: true,
          },
          newValue: { isActive: false },
        },
        tx,
      );

      const roles = await tx.actorRole.findMany({
        where: { actorId, projectId },
        include: { role: { select: { name: true } } },
      });
      for (const assignment of roles) {
        await tx.actorRole.delete({ where: { id: assignment.id } });
        await this.audit.record(
          {
            projectId,
            actorId: requesterActorId,
            entityType: 'ActorRole',
            entityId: assignment.id,
            operation: 'ROLE_REVOKE',
            origin,
            previousValue: {
              actorId,
              displayName: existing.actor.displayName,
              roleId: assignment.roleId,
              roleName: assignment.role.name,
            },
          },
          tx,
        );
      }

      const openTasks = await tx.task.findMany({
        where: {
          projectId,
          assigneeActorId: actorId,
          deletedAt: null,
          status: { not: TaskStatus.TERMINADA },
        },
        select: { id: true, status: true },
      });
      for (const task of openTasks) {
        const status =
          task.status === TaskStatus.ASIGNADA
            ? TaskStatus.PENDIENTE
            : task.status;
        await tx.task.update({
          where: { id: task.id },
          data: { assigneeActorId: null, status },
        });
        await tx.taskAssignment.updateMany({
          where: { taskId: task.id, unassignedAt: null },
          data: { unassignedAt: new Date() },
        });
        await this.audit.record(
          {
            projectId,
            actorId: requesterActorId,
            entityType: 'Task',
            entityId: task.id,
            operation: 'UNASSIGN',
            origin,
            previousValue: { assigneeActorId: actorId, status: task.status },
            newValue: { assigneeActorId: null, status },
          },
          tx,
        );
      }

      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { leadActorId: true },
      });
      if (project.leadActorId === actorId) {
        await tx.project.update({
          where: { id: projectId },
          data: { leadActorId: null },
        });
        await this.audit.record(
          {
            projectId,
            actorId: requesterActorId,
            entityType: 'Project',
            entityId: projectId,
            operation: 'UPDATE',
            origin,
            previousValue: { leadActorId: actorId },
            newValue: { leadActorId: null },
          },
          tx,
        );
      }
      return member;
    });
  }
}
