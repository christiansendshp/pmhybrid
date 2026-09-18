import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import type { AuditOrigin } from '@prisma/client';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AssignRoleDto } from './dto/assign-role.dto.js';
import { RolesService } from './roles.service.js';

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/roles')
export class ProjectRolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAssignments(@Param('projectId') projectId: string) {
    return this.rolesService.findAssignmentsForProject(projectId);
  }

  @Get('my-permissions')
  myPermissions(
    @Param('projectId') projectId: string,
    @CurrentActorId() actorId: string,
  ) {
    return this.rolesService.myPermissions(actorId, projectId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_ROLES_MANAGE)
  assign(
    @Param('projectId') projectId: string,
    @Body() dto: AssignRoleDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.rolesService.assignProjectRole(
      projectId,
      dto.actorId,
      dto.roleId,
      requesterActorId,
      origin,
    );
  }

  @Delete(':actorRoleId')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_ROLES_MANAGE)
  revoke(
    @Param('projectId') projectId: string,
    @Param('actorRoleId') actorRoleId: string,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.rolesService.revokeAssignment(
      projectId,
      actorRoleId,
      requesterActorId,
      origin,
    );
  }
}
