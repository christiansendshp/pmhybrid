import { Controller, Get, Query } from '@nestjs/common';
import { PhasesService } from './phases.service.js';

@Controller('phases')
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.phasesService.findAllForProject(projectId);
  }
}
