import { Controller, Get, Query } from '@nestjs/common';
import { ProjectMembersService } from './project-members.service.js';

@Controller('project-members')
export class ProjectMembersController {
  constructor(private readonly projectMembersService: ProjectMembersService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.projectMembersService.findAllForProject(projectId);
  }
}
