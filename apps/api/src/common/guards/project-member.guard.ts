import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayload } from '../../modules/auth/jwt-payload.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Throws `ForbiddenException` unless `actorId` has an active `ProjectMember`
 * row on `projectId`. Shared by `ProjectMemberGuard` (route-scoped) and any
 * caller that reaches a project-scoped service outside the normal
 * controller/guard pipeline — e.g. an MCP tool handler (Roadmap GAP-30),
 * which has no `:projectId` route param for a `CanActivate` guard to read.
 */
export async function assertProjectMember(
  prisma: PrismaService,
  projectId: string | undefined,
  actorId: string | undefined,
): Promise<void> {
  if (!actorId || !projectId) {
    throw new ForbiddenException('Project membership required');
  }
  const member = await prisma.projectMember.findUnique({
    where: { projectId_actorId: { projectId, actorId } },
  });
  if (!member || !member.isActive) {
    throw new ForbiddenException('Not a member of this project');
  }
}

/**
 * Denies access to a :projectId-scoped route unless the current actor has
 * an active ProjectMember row on that project. Must run after JwtAuthGuard.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const projectId = (request.params as Record<string, string> | undefined)
      ?.projectId;
    await assertProjectMember(this.prisma, projectId, request.user?.sub);
    return true;
  }
}
