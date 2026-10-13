import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditOrigin, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { findSecretLikeKeys } from './agent-config.util.js';
import { AgentLedgerLinkService } from './agent-ledger-link.service.js';
import { identifierKey, identifierProblem } from './agent-identity.util.js';
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
  agentProfile: {
    select: {
      id: true,
      providerType: true,
      configJson: true,
      modelName: true,
      stageRole: true,
      identifiers: {
        select: { kind: true, value: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
} as const;

type AgentRow = Prisma.ActorGetPayload<{ select: typeof AGENT_SELECT }>;

/** The names an agent goes by in the documents, as a request carries them. */
interface Identity {
  /** The explicit ledger name, or null for "the display name". */
  ledgerName: string | null;
  aliases: string[];
}

/**
 * The agent as the API shows it: the profile's identity lifted into plain
 * fields. `ledgerName` is the string PM Hub writes in the ledger and is never
 * empty (the display name when none was chosen; `customLedgerName` says which),
 * `model` is the profile's `modelName`.
 */
function present(row: AgentRow) {
  const { agentProfile, ...actor } = row;
  if (!agentProfile) {
    return { ...actor, agentProfile: null };
  }
  const { id: _profileId, identifiers, modelName, ...profile } = agentProfile;
  const explicit = identifiers.find((item) => item.kind === 'LEDGER_NAME');
  return {
    ...actor,
    agentProfile: {
      ...profile,
      model: modelName,
      ledgerName: explicit?.value ?? actor.displayName,
      customLedgerName: explicit !== undefined,
      aliases: identifiers
        .filter((item) => item.kind === 'ALIAS')
        .map((item) => item.value),
    },
  };
}

type PresentedAgent = ReturnType<typeof present>;

/**
 * Administrable AI agents (brief §3): Actor(kind=AI_AGENT) + AgentProfile.
 * Listed oldest first, so the list order is stable as agents are added.
 * Actor changes are audited as project-less `Actor` events.
 *
 * An agent has one ledger name and any number of aliases (Roadmap TASK-01).
 * Each is unique across the instance once case, spacing and Unicode
 * composition are folded away, and no two agents can answer to the same one:
 * a name in a document must resolve to one agent or to none.
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledgerLinks: AgentLedgerLinkService,
  ) {}

  async findAll(): Promise<PresentedAgent[]> {
    const rows = await this.prisma.actor.findMany({
      where: { kind: 'AI_AGENT' },
      select: AGENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(present);
  }

  async findById(id: string): Promise<PresentedAgent> {
    const agent = await this.prisma.actor.findFirst({
      where: { id, kind: 'AI_AGENT' },
      select: AGENT_SELECT,
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return present(agent);
  }

  async create(
    dto: CreateAgentDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    assertNoSecrets(dto.config);
    await this.assertEmailAvailable(dto.email);
    const identity = identityOf(dto, { ledgerName: null, aliases: [] });
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await this.assertNamesFree(tx, {
          own: null,
          displayName: dto.displayName,
          identity,
        });
        const row = await tx.actor.create({
          data: {
            kind: 'AI_AGENT',
            displayName: dto.displayName,
            email: dto.email,
            avatarUrl: dto.avatarUrl,
            agentProfile: {
              create: {
                providerType: dto.providerType,
                configJson: dto.config as Prisma.InputJsonValue | undefined,
                modelName: dto.model ?? null,
                stageRole: dto.stageRole ?? 'BOTH',
                identifiers: { create: identifierRows(identity ?? undefined) },
              },
            },
          },
          select: AGENT_SELECT,
        });
        const agent = present(row);
        await this.audit.record(
          {
            projectId: null,
            actorId: requesterActorId,
            entityType: 'Actor',
            entityId: agent.id,
            operation: 'CREATE',
            origin,
            newValue: diffFields({}, { kind: agent.kind, ...snapshot(agent) })
              ?.newValue,
          },
          tx,
        );
        return agent;
      });
      await this.relinkLedger();
      return created;
    } catch (error) {
      throw asNameConflict(error);
    }
  }

  async update(
    id: string,
    dto: UpdateAgentDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    const agent = await this.findById(id);
    assertNoSecrets(dto.config);
    if (dto.email && dto.email !== agent.email) {
      await this.assertEmailAvailable(dto.email);
    }
    const current: Identity = {
      ledgerName: agent.agentProfile?.customLedgerName
        ? agent.agentProfile.ledgerName
        : null,
      aliases: agent.agentProfile?.aliases ?? [],
    };
    const identity = identityOf(dto, current);
    const diff = diffFields(snapshot(agent), {
      displayName: dto.displayName,
      email: dto.email,
      avatarUrl: dto.avatarUrl,
      isActive: dto.isActive,
      providerType: dto.providerType,
      config: dto.config,
      model: dto.model,
      stageRole: dto.stageRole,
      ledgerName: identity ? identity.ledgerName : undefined,
      aliases: identity ? sortedNames(identity.aliases) : undefined,
    });
    if (!diff) {
      return agent;
    }

    const profileChanged =
      dto.providerType !== undefined ||
      dto.config !== undefined ||
      dto.model !== undefined ||
      dto.stageRole !== undefined;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        if (identity || dto.displayName !== undefined) {
          await this.assertNamesFree(tx, {
            own: id,
            displayName: dto.displayName,
            identity,
          });
        }
        const updated = await tx.actor.update({
          where: { id },
          data: {
            displayName: dto.displayName,
            email: dto.email,
            avatarUrl: dto.avatarUrl,
            isActive: dto.isActive,
            ...(profileChanged || identity
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
                        modelName: dto.model ?? null,
                        stageRole: dto.stageRole ?? 'BOTH',
                      },
                      update: {
                        providerType: dto.providerType,
                        configJson: dto.config as
                          Prisma.InputJsonValue | undefined,
                        modelName: dto.model,
                        stageRole: dto.stageRole,
                      },
                    },
                  },
                }
              : {}),
          },
          select: AGENT_SELECT,
        });
        let row = updated;
        if (identity && updated.agentProfile) {
          await tx.agentIdentifier.deleteMany({
            where: { agentProfileId: updated.agentProfile.id },
          });
          await tx.agentIdentifier.createMany({
            data: identifierRows(identity).map((item) => ({
              ...item,
              agentProfileId: updated.agentProfile!.id,
            })),
          });
          row = await tx.actor.findUniqueOrThrow({
            where: { id },
            select: AGENT_SELECT,
          });
        }
        await this.audit.record(
          {
            projectId: null,
            actorId: requesterActorId,
            entityType: 'Actor',
            entityId: id,
            operation: 'UPDATE',
            origin,
            ...diff,
          },
          tx,
        );
        return present(row);
      });
      if (identity || dto.displayName !== undefined) {
        await this.relinkLedger();
      }
      return result;
    } catch (error) {
      throw asNameConflict(error);
    }
  }

  /**
   * The ledger's names are linked to agents (Roadmap TASK-02), so a change to an agent's
   * names moves some of those links. Best effort and after the change: a failure to
   * relink never undoes the change, and the next sync links what is still unlinked.
   */
  private async relinkLedger(): Promise<void> {
    try {
      await this.ledgerLinks.relinkAll();
    } catch (error) {
      this.logger.warn(
        `Could not relink the ledger to the agents: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    }
  }

  private async assertEmailAvailable(email: string | undefined) {
    if (email && (await this.prisma.actor.findUnique({ where: { email } }))) {
      throw new ConflictException('Email already in use');
    }
  }

  /**
   * No other agent may answer to a name this one is given: not as a ledger
   * name or an alias, and not as a display name (the resolver reads that too).
   * The answer never says whose it is. `displayName` is checked only against
   * the others' ledger names and aliases: a display name may repeat, as it
   * always could.
   */
  private async assertNamesFree(
    tx: Prisma.TransactionClient,
    wanted: { own: string | null; displayName?: string; identity?: Identity },
  ) {
    const identityKeys = [
      ...(wanted.identity?.ledgerName ? [wanted.identity.ledgerName] : []),
      ...(wanted.identity?.aliases ?? []),
    ].map(identifierKey);
    const displayKey =
      wanted.displayName !== undefined
        ? identifierKey(wanted.displayName)
        : undefined;
    const keys = [...identityKeys, ...(displayKey ? [displayKey] : [])];
    if (keys.length === 0) {
      return;
    }
    const takenAsIdentifier = await tx.agentIdentifier.findFirst({
      where: {
        key: { in: keys },
        ...(wanted.own
          ? { agentProfile: { actorId: { not: wanted.own } } }
          : {}),
      },
      select: { id: true },
    });
    if (takenAsIdentifier) {
      throw nameInUse();
    }
    if (identityKeys.length > 0) {
      const others = await tx.actor.findMany({
        where: {
          kind: 'AI_AGENT',
          ...(wanted.own ? { id: { not: wanted.own } } : {}),
        },
        select: { displayName: true },
      });
      const takenAsDisplayName = others.some((other) =>
        identityKeys.includes(identifierKey(other.displayName)),
      );
      if (takenAsDisplayName) {
        throw nameInUse();
      }
    }
  }
}

function nameInUse() {
  return new ConflictException(
    'That ledger name or alias is already used by another agent',
  );
}

/** Two concurrent saves that pick the same name: the unique key decides, and this is the same answer. */
function asNameConflict(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    String(error.meta?.target ?? '').includes('key')
  ) {
    return nameInUse();
  }
  return error;
}

/**
 * What the request says about the agent's names, validated and with repeats
 * folded away, or undefined when it says nothing: an update that names neither
 * field leaves them as they are.
 */
function identityOf(
  dto: { ledgerName?: string | null; aliases?: string[] },
  current: Identity,
): Identity | undefined {
  if (dto.ledgerName === undefined && dto.aliases === undefined) {
    return undefined;
  }
  const ledgerName =
    dto.ledgerName === undefined
      ? current.ledgerName
      : dto.ledgerName === null
        ? null
        : dto.ledgerName.trim();
  if (ledgerName !== null) {
    const problem = identifierProblem(ledgerName);
    if (problem) {
      throw new BadRequestException(`ledgerName ${problem}`);
    }
  }
  const seen = new Set<string>(ledgerName ? [identifierKey(ledgerName)] : []);
  const aliases: string[] = [];
  const requested = dto.aliases ?? current.aliases;
  for (const [index, raw] of requested.entries()) {
    const alias = raw.trim();
    const problem = identifierProblem(alias);
    if (problem) {
      // Never the value: the one that looks like a credential may be one.
      throw new BadRequestException(`alias number ${index + 1} ${problem}`);
    }
    const key = identifierKey(alias);
    // A repeat, or the ledger name again, adds nothing.
    if (!seen.has(key)) {
      seen.add(key);
      aliases.push(alias);
    }
  }
  return { ledgerName, aliases };
}

function identifierRows(identity: Identity | undefined) {
  if (!identity) {
    return [];
  }
  return [
    ...(identity.ledgerName
      ? [
          {
            kind: 'LEDGER_NAME' as const,
            value: identity.ledgerName,
            key: identifierKey(identity.ledgerName),
          },
        ]
      : []),
    ...identity.aliases.map((alias) => ({
      kind: 'ALIAS' as const,
      value: alias,
      key: identifierKey(alias),
    })),
  ];
}

function sortedNames(names: string[]): string[] {
  return [...names].sort();
}

/** The audited, flat view of an agent — profile fields lifted next to the actor's. */
function snapshot(agent: PresentedAgent): Record<string, unknown> {
  const profile = agent.agentProfile;
  return {
    displayName: agent.displayName,
    email: agent.email,
    avatarUrl: agent.avatarUrl,
    isActive: agent.isActive,
    providerType: profile?.providerType ?? null,
    config: profile?.configJson ?? null,
    model: profile?.model ?? null,
    stageRole: profile?.stageRole ?? 'BOTH',
    ledgerName: profile?.customLedgerName ? profile.ledgerName : null,
    aliases: sortedNames(profile?.aliases ?? []),
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
