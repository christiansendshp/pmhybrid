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
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { ProjectMembersService } from './project-members.service.js';

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/members')
export class ProjectMembersController {
  constructor(private readonly projectMembersService: ProjectMembersService) {}

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.projectMembersService.findAllForProject(projectId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_MEMBERS_MANAGE)
  addMember(@Param('projectId') projectId: string, @Body() dto: AddMemberDto) {
    return this.projectMembersService.addMember(projectId, dto.actorId);
  }

  @Delete(':actorId')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_MEMBERS_MANAGE)
  removeMember(
    @Param('projectId') projectId: string,
    @Param('actorId') actorId: string,
  ) {
    return this.projectMembersService.removeMember(projectId, actorId);
  }
}
