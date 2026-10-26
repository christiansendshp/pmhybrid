import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectMembersModule } from '../project-members/project-members.module.js';
import { AgentLedgerLinkService } from './agent-ledger-link.service.js';
import { AgentApiKeysController } from './agent-api-keys.controller.js';
import { AgentApiKeysService } from './agent-api-keys.service.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { UnregisteredAgentsController } from './unregistered-agents.controller.js';
import { UnregisteredAgentsService } from './unregistered-agents.service.js';

@Module({
  imports: [AuthModule, ProjectMembersModule],
  controllers: [
    AgentsController,
    AgentApiKeysController,
    UnregisteredAgentsController,
  ],
  providers: [
    AgentsService,
    AgentApiKeysService,
    AgentLedgerLinkService,
    UnregisteredAgentsService,
  ],
  exports: [AgentsService, AgentLedgerLinkService],
})
export class AgentsModule {}
