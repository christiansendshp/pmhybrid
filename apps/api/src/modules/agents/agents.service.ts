import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { findSecretLikeKeys } from './agent-config.util.js';
import { CreateAgentDto } from './dto/create-agent.dto.js';
import { UpdateAgentDto } from './dto/update-agent.dto.js';

const AGENT_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  email: true,
  avatarUrl: true,
  isActive: true,
  createdAt: true,
  agentProfile: { select: { providerType: true, configJson: true } },
} as const;

/**
 * Administrable AI agents (brief §3): Actor(kind=AI_AGENT) + AgentProfile.
 * Listed oldest first, so the list order is stable as agents are added.
 * Actor changes are audited as project-less `Actor` events.
 */
@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.actor.findMany({
      where: { kind: 'AI_AGENT' },
      select: AGENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    const agent = await this.prisma.actor.findFirst({
      where: { id, kind: 'AI_AGENT' },
      select: AGENT_SELECT,
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }

  async create(dto: CreateAgentDto, requesterActorId: string) {
    assertNoSecrets(dto.config);
    await this.assertEmailAvailable(dto.email);
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.actor.create({
        data: {
          kind: 'AI_AGENT',
          displayName: dto.displayName,
          email: dto.email,
          avatarUrl: dto.avatarUrl,
          agentProfile: {
            create: {
              providerType: dto.providerType,
              configJson: dto.config as Prisma.InputJsonValue | undefined,
            },
          },
        },
        select: AGENT_SELECT,
      });
      await this.audit.record(
        {
          projectId: null,
          actorId: requesterActorId,
          entityType: 'Actor',
          entityId: agent.id,
          operation: 'CREATE',
          origin: 'UI',
          newValue: diffFields({}, { kind: agent.kind, ...snapshot(agent) })
            ?.newValue,
        },
        tx,
      );
      return agent;
    });
  }

  async update(id: string, dto: UpdateAgentDto, requesterActorId: string) {
    const agent = await this.findById(id);
    assertNoSecrets(dto.config);
    if (dto.email && dto.email !== agent.email) {
      await this.assertEmailAvailable(dto.email);
    }
    const diff = diffFields(snapshot(agent), {
      displayName: dto.displayName,
      email: dto.email,
      avatarUrl: dto.avatarUrl,
      isActive: dto.isActive,
      providerType: dto.providerType,
      config: dto.config,
    });
    if (!diff) {
      return agent;
    }

    const profileChanged =
      dto.providerType !== undefined || dto.config !== undefined;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.actor.update({
        where: { id },
        data: {
          displayName: dto.displayName,
          email: dto.email,
          avatarUrl: dto.avatarUrl,
          isActive: dto.isActive,
          ...(profileChanged
            ? {
                agentProfile: {
                  upsert: {
                    create: {
                      providerType:
                        dto.providerType ??
                        agent.agentProfile?.providerType ??
                        'custom',
                      configJson: dto.config as
                        Prisma.InputJsonValue | undefined,
                    },
                    update: {
                      providerType: dto.providerType,
                      configJson: dto.config as
                        Prisma.InputJsonValue | undefined,
                    },
                  },
                },
              }
            : {}),
        },
        select: AGENT_SELECT,
      });
      await this.audit.record(
        {
          projectId: null,
          actorId: requesterActorId,
          entityType: 'Actor',
          entityId: id,
          operation: 'UPDATE',
          origin: 'UI',
          ...diff,
        },
        tx,
      );
      return updated;
    });
  }

  private async assertEmailAvailable(email: string | undefined) {
    if (email && (await this.prisma.actor.findUnique({ where: { email } }))) {
      throw new ConflictException('Email already in use');
    }
  }
}

/** The audited, flat view of an agent — profile fields lifted next to the actor's. */
function snapshot(agent: {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  agentProfile: { providerType: string; configJson: unknown } | null;
}): Record<string, unknown> {
  return {
    displayName: agent.displayName,
    email: agent.email,
    avatarUrl: agent.avatarUrl,
    isActive: agent.isActive,
    providerType: agent.agentProfile?.providerType ?? null,
    config: agent.agentProfile?.configJson ?? null,
  };
}

function assertNoSecrets(config: Record<string, unknown> | undefined) {
  const secretKeys = findSecretLikeKeys(config);
  if (secretKeys.length > 0) {
    throw new BadRequestException(
      `Agent config must not contain credentials (${secretKeys.join(', ')}); keep secrets in environment variables`,
    );
  }
}
