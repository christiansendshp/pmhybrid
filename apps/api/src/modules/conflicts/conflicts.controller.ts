import { Controller, Get, Query } from '@nestjs/common';
import { ConflictsService } from './conflicts.service.js';

@Controller('conflicts')
export class ConflictsController {
  constructor(private readonly conflictsService: ConflictsService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.conflictsService.findAllForProject(projectId);
  }
}
