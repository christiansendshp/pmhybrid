import { Controller, Get, Query } from '@nestjs/common';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.tasksService.findAllForProject(projectId);
  }
}
