import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { InstantCloseService } from './instant-close.service.js';

/** Figures about how the project's work is recorded (Roadmap TASK-12, TASK-23). Read-only, for any member. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/metrics')
export class MetricsController {
  constructor(private readonly instantCloses: InstantCloseService) {}

  @Get()
  get(@Param('projectId') projectId: string) {
    return this.instantCloses.metrics(projectId);
  }

  /** When the ledger says each task started and was closed: what the timeline draws its bars from. */
  @Get('spans')
  spans(@Param('projectId') projectId: string) {
    return this.instantCloses.spans(projectId);
  }
}
