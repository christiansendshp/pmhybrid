import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AgentLedgerLinkService } from './agent-ledger-link.service.js';
import { AgentApiKeysController } from './agent-api-keys.controller.js';
import { AgentApiKeysService } from './agent-api-keys.service.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AgentsController, AgentApiKeysController],
  providers: [AgentsService, AgentApiKeysService, AgentLedgerLinkService],
  exports: [AgentsService, AgentLedgerLinkService],
})
export class AgentsModule {}
