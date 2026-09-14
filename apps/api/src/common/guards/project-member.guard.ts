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
    const actorId = request.user?.sub;
    const projectId = (request.params as Record<string, string> | undefined)
      ?.projectId;

    if (!actorId || !projectId) {
      throw new ForbiddenException('Project membership required');
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
    });
    if (!member || !member.isActive) {
      throw new ForbiddenException('Not a member of this project');
    }
    return true;
  }
}
