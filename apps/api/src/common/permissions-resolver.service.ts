import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Resolves an actor's effective permission keys: global ActorRole grants
 * (projectId IS NULL) union project-scoped grants for the given project, if
 * any (docs/domain-model.md RBAC section). Shared by PermissionGuard and
 * the /projects/:projectId/my-permissions endpoint so both stay in sync.
 */
@Injectable()
export class PermissionsResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(actorId: string, projectId?: string): Promise<Set<string>> {
    const actorRoles = await this.prisma.actorRole.findMany({
      where: {
        actorId,
        OR: [{ projectId: null }, ...(projectId ? [{ projectId }] : [])],
      },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });

    const keys = new Set<string>();
    for (const actorRole of actorRoles) {
      for (const rolePermission of actorRole.role.rolePermissions) {
        keys.add(rolePermission.permission.key);
      }
    }
    return keys;
  }

  async hasPermission(
    actorId: string,
    permission: string,
    projectId?: string,
  ): Promise<boolean> {
    const keys = await this.resolve(actorId, projectId);
    return keys.has(permission);
  }
}
