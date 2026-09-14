import { Controller, Get, Query } from '@nestjs/common';
import { EpicsService } from './epics.service.js';

@Controller('epics')
export class EpicsController {
  constructor(private readonly epicsService: EpicsService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.epicsService.findAllForProject(projectId);
  }
}
