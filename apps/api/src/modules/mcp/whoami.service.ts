import { Injectable } from '@nestjs/common';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ledgerNameOf } from '../agents/agent-identity.util.js';

/** Who the caller of an MCP tool is, as PM Hub knows it (Roadmap TASK-04). */
export interface WhoAmI {
  id: string;
  kind: 'HUMAN' | 'AI_AGENT';
  displayName: string;
  /** The exact string to pass to the skill as `<agent>`, and the one PM Hub writes in the ledger for this actor. */
  ledgerName: string;
  /** Other strings this agent has written; the skill and PM Hub both resolve them to it. Empty for a person. */
  aliases: string[];
  model: string | null;
  stageRole: 'DEVELOPER' | 'QA' | 'BOTH' | null;
  /** The projects the caller is an active member of, with what it may do in each. */
  projects: { id: string; name: string; permissions: string[] }[];
}

/**
 * The answer to "who am I?" for an agent holding an API key: the identity PM Hub gives it,
 * so it need not guess the string it passes to the skill. It is built from the caller's own
 * actor id (the key's), and nothing of any other actor is read.
 */
@Injectable()
export class WhoAmIService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsResolverService,
  ) {}

  async whoami(actorId: string): Promise<WhoAmI> {
    const actor = await this.prisma.actor.findUniqueOrThrow({
      where: { id: actorId },
      select: {
        id: true,
        kind: true,
        displayName: true,
        agentProfile: {
          select: {
            modelName: true,
            stageRole: true,
            identifiers: {
              select: { kind: true, value: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    const memberships = await this.prisma.projectMember.findMany({
      where: { actorId, isActive: true },
      select: { project: { select: { id: true, name: true } } },
      orderBy: { project: { createdAt: 'asc' } },
    });
    const projects = await Promise.all(
      memberships.map(async ({ project }) => ({
        id: project.id,
        name: project.name,
        permissions: [
          ...(await this.permissions.resolve(actorId, project.id)),
        ].sort(),
      })),
    );
    const profile = actor.agentProfile;
    const identifiers = profile?.identifiers ?? [];
    return {
      id: actor.id,
      kind: actor.kind,
      displayName: actor.displayName,
      ledgerName: ledgerNameOf({
        displayName: actor.displayName,
        agentProfile: {
          identifiers: identifiers.filter(
            (item) => item.kind === 'LEDGER_NAME',
          ),
        },
      }),
      aliases: identifiers
        .filter((item) => item.kind === 'ALIAS')
        .map((item) => item.value),
      model: profile?.modelName ?? null,
      stageRole: profile?.stageRole ?? null,
      projects,
    };
  }
}
