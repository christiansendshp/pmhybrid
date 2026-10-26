import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ImportUntrackedDto } from './dto/import-untracked.dto.js';
import { UntrackedImportService } from './untracked-import.service.js';

/** Importing the work the ledger closed as done tasks changes the project's numbers, so it takes the permission to write tasks (Roadmap TASK-34). */
@UseGuards(JwtAuthGuard, ProjectMemberGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.TASK_WRITE)
@Controller('projects/:projectId/documents/agentslog/untracked/import')
export class UntrackedImportController {
  constructor(private readonly untrackedImport: UntrackedImportService) {}

  @Post()
  import(
    @Param('projectId') projectId: string,
    @Body() dto: ImportUntrackedDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.untrackedImport.import(
      projectId,
      dto.ids,
      requesterActorId,
      origin,
    );
  }
}
