import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './projects.service.js';
import { PERMISSIONS } from '@pmhybrid/shared-types';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /** "My Projects" (brief §19) — projects the caller is a member of. */
  @Get()
  findMine(@CurrentActorId() actorId: string) {
    return this.projectsService.findAllForActor(actorId);
  }

  @Get(':projectId')
  @UseGuards(ProjectMemberGuard)
  findOne(@Param('projectId') projectId: string) {
    return this.projectsService.findById(projectId);
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentActorId() actorId: string) {
    return this.projectsService.create(dto, actorId);
  }

  @Patch(':projectId')
  @UseGuards(ProjectMemberGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_UPDATE)
  update(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
    @CurrentActorId() requesterActorId: string,
  ) {
    return this.projectsService.update(projectId, dto, requesterActorId);
  }
}
