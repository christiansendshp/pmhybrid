import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ListTaskTableQueryDto } from './dto/list-task-table-query.dto.js';
import { TaskTableService } from './task-table.service.js';

/**
 * The tasks of a project as a table (Roadmap TASK-18): filtered like the board, ordered by a column
 * and cut into pages on the server, so the order holds across pages. Read-only, for any member.
 */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/task-table')
export class TaskTableController {
  constructor(private readonly taskTable: TaskTableService) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListTaskTableQueryDto,
  ) {
    return this.taskTable.list(projectId, query);
  }
}
