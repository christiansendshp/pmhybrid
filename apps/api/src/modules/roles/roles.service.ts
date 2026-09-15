import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
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

  /**
   * Replaces a role's entire permission set (brief §4 "permisos
   * configurables"). Every seeded role currently has `isSystem: true`
   * (apps/api/prisma/seed.ts) — permission edits apply to any role, system
   * or not; `isSystem` only ever protected the role's name/existence, which
   * this endpoint doesn't touch.
   *
   * Refuses a write that would leave no actor holding roles.manage
   * instance-wide (only global, projectId-null grants count — the same
   * scope PermissionGuard checks for this route), since nothing could ever
   * grant it back. Checked after applying the change, inside the same
   * transaction, so a violation rolls the whole write back.
   */
  async updateRolePermissions(
    roleId: string,
    permissionKeys: string[],
    requesterActorId: string,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('No such role');
    }

    const uniqueKeys = [...new Set(permissionKeys)];
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: uniqueKeys } },
    });
    if (permissions.length !== uniqueKeys.length) {
      const known = new Set(permissions.map((p) => p.key));
      const unknown = uniqueKeys.filter((key) => !known.has(key));
      throw new BadRequestException(
        `Unknown permission key(s): ${unknown.join(', ')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const previousKeys = (
        await tx.rolePermission.findMany({
          where: { roleId },
          include: { permission: { select: { key: true } } },
        })
      ).map((rp) => rp.permission.key);

      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId, permissionId: p.id })),
        });
      }

      const stillGranted = await tx.actorRole.findFirst({
        where: {
          projectId: null,
          role: {
            rolePermissions: {
              some: { permission: { key: PERMISSIONS.ROLES_MANAGE } },
            },
          },
        },
      });
      if (!stillGranted) {
        throw new BadRequestException(
          'This change would leave no actor able to manage roles; refused',
        );
      }

      await this.audit.record(
        {
          projectId: null,
          actorId: requesterActorId,
          entityType: 'Role',
          entityId: roleId,
          operation: 'ROLE_PERMISSIONS_UPDATE',
          origin: 'UI',
          previousValue: { permissionKeys: previousKeys },
          newValue: { permissionKeys: uniqueKeys },
        },
        tx,
      );

      return tx.role.findUniqueOrThrow({
        where: { id: roleId },
        include: { rolePermissions: { include: { permission: true } } },
      });
    });
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
