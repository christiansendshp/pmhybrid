import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GitProvidersModule } from '../git-providers/git-providers.module.js';
import { AgentslogParserService } from './agentslog-parser.service.js';
import { RoadmapController } from './roadmap.controller.js';
import { RoadmapParserService } from './roadmap-parser.service.js';

@Module({
  imports: [AuthModule, GitProvidersModule],
  controllers: [RoadmapController],
  providers: [RoadmapParserService, AgentslogParserService],
  exports: [RoadmapParserService, AgentslogParserService],
})
export class RoadmapModule {}
