import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';
import { AuditService } from './audit.service.js';

/** A project's change history (brief §25, §31 "historial de cambios") — readable by any project member. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: AuditQueryDto,
  ) {
    return this.auditService.findForProject(projectId, query);
  }
}
