import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RoadmapModule } from '../roadmap/roadmap.module.js';
import { GitProvidersModule } from '../git-providers/git-providers.module.js';
import { AgentslogIngestionService } from './agentslog-ingestion.service.js';
import { SyncSchedulerService } from './sync-scheduler.service.js';
import { SynchronizationController } from './synchronization.controller.js';
import { SynchronizationService } from './synchronization.service.js';
import { WriteBackService } from './write-back.service.js';

@Module({
  imports: [AuthModule, RoadmapModule, GitProvidersModule],
  controllers: [SynchronizationController],
  providers: [
    SynchronizationService,
    AgentslogIngestionService,
    WriteBackService,
    SyncSchedulerService,
  ],
  exports: [SynchronizationService, WriteBackService],
})
export class SynchronizationModule {}
