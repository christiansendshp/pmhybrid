import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RoadmapModule } from '../roadmap/roadmap.module.js';
import { SynchronizationModule } from '../synchronization/synchronization.module.js';
import { UntrackedImportController } from './untracked-import.controller.js';
import { UntrackedImportService } from './untracked-import.service.js';

@Module({
  imports: [AuthModule, RoadmapModule, SynchronizationModule],
  controllers: [UntrackedImportController],
  providers: [UntrackedImportService],
})
export class UntrackedWorkModule {}
