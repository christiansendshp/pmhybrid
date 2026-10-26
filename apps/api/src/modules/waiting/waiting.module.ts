import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GitProvidersModule } from '../git-providers/git-providers.module.js';
import { RoadmapModule } from '../roadmap/roadmap.module.js';
import { WaitingController } from './waiting.controller.js';
import { WaitingService } from './waiting.service.js';

@Module({
  imports: [AuthModule, GitProvidersModule, RoadmapModule],
  controllers: [WaitingController],
  providers: [WaitingService],
  exports: [WaitingService],
})
export class WaitingModule {}
