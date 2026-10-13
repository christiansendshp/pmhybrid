import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TasksService } from './tasks.service.js';

/** Who a task in QA can be handed to for review (Roadmap SUBTASK-09.3). Read-only, for any member. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/reviewers')
export class ReviewersController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(@Param('projectId') projectId: string) {
    return this.tasksService.reviewerCandidates(projectId);
  }
}
