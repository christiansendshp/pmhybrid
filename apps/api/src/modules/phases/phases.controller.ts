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
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreatePhaseDto } from './dto/create-phase.dto.js';
import { UpdatePhaseDto } from './dto/update-phase.dto.js';
import { PhasesService } from './phases.service.js';

/** Hierarchy management is treated as a project-configuration concern, gated by project.update (docs/domain-model.md §5 pragmatic simplification — no dedicated hierarchy permission key). */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/phases')
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.phasesService.findAllForProject(projectId);
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.phasesService.findById(projectId, id);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_UPDATE)
  create(@Param('projectId') projectId: string, @Body() dto: CreatePhaseDto) {
    return this.phasesService.create(projectId, dto);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_UPDATE)
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePhaseDto,
  ) {
    return this.phasesService.update(projectId, id, dto);
  }
}
