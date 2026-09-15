import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateEpicDto } from './dto/create-epic.dto.js';
import { UpdateEpicDto } from './dto/update-epic.dto.js';
import { EpicsService } from './epics.service.js';

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/epics')
export class EpicsController {
  constructor(private readonly epicsService: EpicsService) {}

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.epicsService.findAllForProject(projectId);
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.epicsService.findById(projectId, id);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_UPDATE)
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateEpicDto,
    @CurrentActorId() requesterActorId: string,
  ) {
    return this.epicsService.create(projectId, dto, requesterActorId);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_UPDATE)
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEpicDto,
    @CurrentActorId() requesterActorId: string,
  ) {
    return this.epicsService.update(projectId, id, dto, requesterActorId);
  }
}
