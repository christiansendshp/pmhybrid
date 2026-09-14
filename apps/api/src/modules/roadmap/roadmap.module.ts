import { Module } from '@nestjs/common';
import { AgentslogParserService } from './agentslog-parser.service.js';
import { RoadmapParserService } from './roadmap-parser.service.js';

@Module({
  providers: [RoadmapParserService, AgentslogParserService],
  exports: [RoadmapParserService, AgentslogParserService],
})
export class RoadmapModule {}
