import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TitleNormalizationService } from './title-normalization.service.js';

/**
 * Asking for the normalization of long titles again (Roadmap GAP-39d). The
 * work itself runs in the background after the answer: these only queue.
 */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId')
export class TitleNormalizationController {
  constructor(private readonly service: TitleNormalizationService) {}

  /** Queues the failed ones and the long titles read before the feature existed; `project.update`, as it spends the LLM on a whole project. */
  @Post('titles/normalize')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.PROJECT_UPDATE)
  normalizeProject(@Param('projectId') projectId: string) {
    return this.service.queueProject(projectId);
  }

  /** One task again: `task.write`, like any edit of it. */
  @Post('tasks/:taskId/normalize-title')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.TASK_WRITE)
  normalizeTask(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.service.retryTask(projectId, taskId);
  }
}
