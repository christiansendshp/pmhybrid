import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SnapshotsQueryDto } from './dto/snapshots-query.dto.js';
import { SnapshotService } from './snapshot.service.js';

/** How a project was, day by day, to any member (Roadmap TASK-46): it is made of what their board already shows. */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/snapshots')
export class SnapshotController {
  constructor(private readonly snapshots: SnapshotService) {}

  /**
   * Rebuilds the past days that have no snapshot from the tasks' dates, approximate and labelled so (Roadmap
   * TASK-47). It writes, so it needs the permission to change the project.
   */
  @Post('reconstruct')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_UPDATE)
  reconstruct(
    @Param('projectId') projectId: string,
    @Query() query: SnapshotsQueryDto,
  ) {
    return this.snapshots.reconstruct(projectId, query.days);
  }

  @Get()
  history(
    @Param('projectId') projectId: string,
    @Query() query: SnapshotsQueryDto,
  ) {
    return this.snapshots.history(projectId, query.days);
  }
}
