import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsResolver: PermissionsResolverService,
    private readonly audit: AuditService,
  ) {}

  findAllRoles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  findAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  findAssignmentsForProject(projectId: string) {
    return this.prisma.actorRole.findMany({
      where: { projectId },
      include: {
        role: true,
        actor: {
          select: { id: true, displayName: true, kind: true, email: true },
        },
      },
    });
  }

  async myPermissions(actorId: string, projectId: string): Promise<string[]> {
    return [...(await this.permissionsResolver.resolve(actorId, projectId))];
  }

  /**
   * Project-scoped assignment only (projectId always set here): a GLOBAL
   * role such as ADMIN is granted outside any project and is refused here,
   * so a project owner can never escalate someone to instance-wide rights.
   * Idempotent: an existing grant is returned as-is, with no audit entry.
   */
  async assignProjectRole(
    projectId: string,
    actorId: string,
    roleId: string,
    requesterActorId: string,
  ) {
    const existing = await this.prisma.actorRole.findUnique({
      where: { actorId_roleId_projectId: { actorId, roleId, projectId } },
    });
    if (existing) {
      return existing;
    }
    const [role, actor] = await Promise.all([
      this.prisma.role.findUnique({ where: { id: roleId } }),
      this.prisma.actor.findUnique({ where: { id: actorId } }),
    ]);
    if (!role) {
      throw new BadRequestException('No such role');
    }
    if (role.scope !== 'PROJECT') {
      throw new BadRequestException(
        'Only project-scoped roles can be granted within a project',
      );
    }
    if (!actor) {
      throw new BadRequestException('No such actor');
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.actorRole.create({
        data: { actorId, roleId, projectId },
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'ActorRole',
          entityId: assignment.id,
          operation: 'ROLE_ASSIGN',
          origin: 'UI',
          newValue: {
            actorId,
            displayName: actor.displayName,
            roleId,
            roleName: role.name,
          },
        },
        tx,
      );
      return assignment;
    });
  }

  async revokeAssignment(
    projectId: string,
    actorRoleId: string,
    requesterActorId: string,
  ) {
    const assignment = await this.prisma.actorRole.findUnique({
      where: { id: actorRoleId },
      include: {
        role: { select: { name: true } },
        actor: { select: { displayName: true } },
      },
    });
    if (!assignment || assignment.projectId !== projectId) {
      throw new NotFoundException('No such role assignment on this project');
    }
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.actorRole.delete({ where: { id: actorRoleId } });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'ActorRole',
          entityId: actorRoleId,
          operation: 'ROLE_REVOKE',
          origin: 'UI',
          previousValue: {
            actorId: assignment.actorId,
            displayName: assignment.actor.displayName,
            roleId: assignment.roleId,
            roleName: assignment.role.name,
          },
        },
        tx,
      );
      return deleted;
    });
  }
}
