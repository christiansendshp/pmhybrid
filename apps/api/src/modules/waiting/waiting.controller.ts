import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WaitingService } from './waiting.service.js';

/** What the project is waiting for, to any member (Roadmap TASK-32): it is what the Blocked table, the ledger and the conflicts already show them. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/waiting')
export class WaitingController {
  constructor(private readonly waiting: WaitingService) {}

  @Get()
  get(@Param('projectId') projectId: string) {
    return this.waiting.forProject(projectId);
  }
}
