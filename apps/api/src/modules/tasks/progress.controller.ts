import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProgressRollupService } from './progress-rollup.service.js';

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/progress')
export class ProgressController {
  constructor(private readonly progressRollup: ProgressRollupService) {}

  @Get()
  getTree(@Param('projectId') projectId: string) {
    return this.progressRollup.getProjectProgressTree(projectId);
  }
}
