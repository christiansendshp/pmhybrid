import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsResolver: PermissionsResolverService,
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
   * Project-scoped assignment only (projectId always set here) — no
   * global-scope role currently exists in the seeded catalog (all seven
   * system roles are scope=PROJECT), so exposing global assignment over
   * HTTP is deferred until a global role actually exists to grant.
   */
  assignProjectRole(projectId: string, actorId: string, roleId: string) {
    return this.prisma.actorRole.upsert({
      where: { actorId_roleId_projectId: { actorId, roleId, projectId } },
      update: {},
      create: { actorId, roleId, projectId },
    });
  }

  async revokeAssignment(projectId: string, actorRoleId: string) {
    const assignment = await this.prisma.actorRole.findUnique({
      where: { id: actorRoleId },
    });
    if (!assignment || assignment.projectId !== projectId) {
      throw new NotFoundException('No such role assignment on this project');
    }
    return this.prisma.actorRole.delete({ where: { id: actorRoleId } });
  }
}
