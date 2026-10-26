import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaceQueryDto } from './dto/pace-query.dto.js';
import { PaceService } from './pace.service.js';

/** The pace, the burn-up and the forecast of a project, to any member (Roadmap TASK-36): it is made of what their board already shows. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/metrics/pace')
export class PaceController {
  constructor(private readonly pace: PaceService) {}

  @Get()
  get(@Param('projectId') projectId: string, @Query() query: PaceQueryDto) {
    return this.pace.forProject(projectId, query.weeks);
  }
}
