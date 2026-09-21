import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import type { AuditOrigin } from '@prisma/client';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ConflictsService } from './conflicts.service.js';
import { ResolveConflictDto } from './dto/resolve-conflict.dto.js';

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/conflicts')
export class ConflictsController {
  constructor(private readonly conflictsService: ConflictsService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query('resolved') resolved?: string,
  ) {
    return this.conflictsService.findAllForProject(
      projectId,
      resolved === undefined ? undefined : resolved === 'true',
    );
  }

  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.conflictsService.findById(projectId, id);
  }

  @Post(':id/resolve')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.CONFLICT_RESOLVE)
  resolve(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.conflictsService.resolve(
      projectId,
      id,
      dto,
      requesterActorId,
      origin,
    );
  }
}
