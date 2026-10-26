import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import { AgentLedgerLinkService } from './agent-ledger-link.service.js';
import { identifierKey, identifierProblem } from './agent-identity.util.js';
import { AgentsService } from './agents.service.js';

/**
 * Turns a name the ledger carries into an agent of the project, when a person asks (Roadmap TASK-03,
 * DEC-004 D2). Nothing is ever registered by itself: the sync only lists the names; this is the click.
 */
@Injectable()
export class UnregisteredAgentsService {
  constructor(
    private readonly links: AgentLedgerLinkService,
    private readonly agents: AgentsService,
    private readonly members: ProjectMembersService,
    private readonly permissions: PermissionsResolverService,
    private readonly audit: AuditService,
  ) {}

  list(projectId: string) {
    return this.links.unregistered(projectId);
  }

  /**
   * Creates the agent that name is, with the name as its display name and as an alias (so renaming it
   * later keeps the link), and makes it a member of the project. Creating an agent is a global
   * permission, adding a member a project one: both are asked. The two steps are audited each.
   */
  async register(
    projectId: string,
    name: string,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    const mayCreate = await this.permissions.hasPermission(
      requesterActorId,
      PERMISSIONS.ACTORS_MANAGE,
      projectId,
    );
    if (!mayCreate) {
      throw new ForbiddenException(
        `Missing permission: ${PERMISSIONS.ACTORS_MANAGE}`,
      );
    }
    // Only a name the ledger really carries: this is not a second way to create any agent.
    const key = identifierKey(name);
    const listed = (await this.links.unregistered(projectId)).find(
      (item) => identifierKey(item.name) === key,
    );
    if (!listed) {
      throw new BadRequestException(
        'No such name is waiting to be registered in this project',
      );
    }
    if (listed.reason === 'AMBIGUOUS') {
      throw new ConflictException(
        'Two agents already answer to this name: change their names first',
      );
    }
    const problem = identifierProblem(listed.name);
    if (problem) {
      throw new BadRequestException(`The name ${problem}`);
    }

    const agent = await this.agents.create(
      {
        displayName: listed.name,
        providerType: 'custom',
        aliases: [listed.name],
      },
      requesterActorId,
      origin,
    );
    await this.members.addMember(projectId, agent.id, requesterActorId, origin);
    await this.audit.record({
      projectId,
      actorId: requesterActorId,
      entityType: 'Actor',
      entityId: agent.id,
      operation: 'AGENT_REGISTERED_FROM_LEDGER',
      origin,
      newValue: { name: listed.name, entries: listed.entries },
    });
    return agent;
  }
}
