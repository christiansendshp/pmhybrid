import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RegisterUnregisteredAgentDto } from './dto/register-unregistered-agent.dto.js';
import { UnregisteredAgentsService } from './unregistered-agents.service.js';

/**
 * The agents the project's ledger names that nobody registered, and registering one (Roadmap TASK-03).
 * Both need to manage the project's members: the list is only useful to someone who can act on it.
 */
@UseGuards(JwtAuthGuard, ProjectMemberGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.PROJECT_MEMBERS_MANAGE)
@Controller('projects/:projectId/agents/unregistered')
export class UnregisteredAgentsController {
  constructor(private readonly unregistered: UnregisteredAgentsService) {}

  @Get()
  list(@Param('projectId') projectId: string) {
    return this.unregistered.list(projectId);
  }

  @Post()
  register(
    @Param('projectId') projectId: string,
    @Body() dto: RegisterUnregisteredAgentDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.unregistered.register(
      projectId,
      dto.name,
      requesterActorId,
      origin,
    );
  }
}
