import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReportService } from './report.service.js';

/** The weekly status report of a project, to any member (Roadmap TASK-48): it is made of what their board already shows. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/report')
export class ReportController {
  constructor(private readonly report: ReportService) {}

  @Get()
  get(@Param('projectId') projectId: string) {
    return this.report.forProject(projectId);
  }
}
