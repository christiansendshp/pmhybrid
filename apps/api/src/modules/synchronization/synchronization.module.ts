import { Module } from '@nestjs/common';
import { RoadmapModule } from '../roadmap/roadmap.module.js';
import { GitProvidersModule } from '../git-providers/git-providers.module.js';
import { SynchronizationController } from './synchronization.controller.js';
import { SynchronizationService } from './synchronization.service.js';

@Module({
  imports: [RoadmapModule, GitProvidersModule],
  controllers: [SynchronizationController],
  providers: [SynchronizationService],
  exports: [SynchronizationService],
})
export class SynchronizationModule {}
