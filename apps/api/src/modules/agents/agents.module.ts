import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AgentApiKeysController } from './agent-api-keys.controller.js';
import { AgentApiKeysService } from './agent-api-keys.service.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AgentsController, AgentApiKeysController],
  providers: [AgentsService, AgentApiKeysService],
  exports: [AgentsService],
})
export class AgentsModule {}
