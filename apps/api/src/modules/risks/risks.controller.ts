import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RisksService } from './risks.service.js';

/** What is going wrong in a project, to any member (Roadmap TASK-44): it is made of what their board already shows. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/risks')
export class RisksController {
  constructor(private readonly risks: RisksService) {}

  @Get()
  get(@Param('projectId') projectId: string) {
    return this.risks.forProject(projectId);
  }
}
