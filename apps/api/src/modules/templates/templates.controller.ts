import { Controller, Get, Query } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.templatesService.findAllForProject(projectId);
  }
}
