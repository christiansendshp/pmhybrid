import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SnapshotsQueryDto } from './dto/snapshots-query.dto.js';
import { SnapshotService } from './snapshot.service.js';

/** How a project was, day by day, to any member (Roadmap TASK-46): it is made of what their board already shows. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/snapshots')
export class SnapshotController {
  constructor(private readonly snapshots: SnapshotService) {}

  @Get()
  history(
    @Param('projectId') projectId: string,
    @Query() query: SnapshotsQueryDto,
  ) {
    return this.snapshots.history(projectId, query.days);
  }
}
