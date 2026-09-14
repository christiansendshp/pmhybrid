import { Controller, Param, Post } from '@nestjs/common';
import { SynchronizationService } from './synchronization.service.js';

@Controller('projects/:projectId/sync')
export class SynchronizationController {
  constructor(
    private readonly synchronizationService: SynchronizationService,
  ) {}

  @Post()
  async triggerManualSync(@Param('projectId') projectId: string) {
    await this.synchronizationService.runSync(projectId, 'MANUAL');
    return { projectId, trigger: 'MANUAL' };
  }
}
