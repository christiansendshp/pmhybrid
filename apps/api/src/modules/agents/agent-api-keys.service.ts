import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import { generateApiKey } from '../auth/api-key-crypto.util.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';

const KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  createdAt: true,
  revokedAt: true,
  // Roadmap SECURITY-04b2: when a key stops working, what it may do, and when it was last used.
  expiresAt: true,
  scope: true,
  lastUsedAt: true,
} as const;

/**
 * Controlled API access for AI agents (brief §27, §28, Roadmap GAP-15):
 * mint and revoke hashed API keys scoped to one agent Actor. Never returns
 * `secretHash`, and the plaintext key exists only in the create response —
 * it is not retrievable afterward by design.
 */
@Injectable()
export class AgentApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAllForAgent(agentId: string) {
    await this.assertAgentExists(agentId);
    return this.prisma.apiKey.findMany({
      where: { actorId: agentId },
      select: KEY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    agentId: string,
    dto: CreateApiKeyDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    await this.assertAgentExists(agentId);
    const generated = generateApiKey();
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          actorId: agentId,
          name: dto.name,
          prefix: generated.prefix,
          secretHash: generated.secretHash,
          scope: dto.scope ?? 'READ_WRITE',
          expiresAt: dto.expiresInDays
            ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
            : null,
        },
        select: KEY_SELECT,
      });
      await this.audit.record(
        {
          projectId: null,
          actorId: requesterActorId,
          entityType: 'ApiKey',
          entityId: created.id,
          operation: 'API_KEY_CREATE',
          origin,
          newValue: diffFields(
            {},
            {
              apiKeyId: created.id,
              name: created.name,
              prefix: created.prefix,
              scope: created.scope,
              expiresAt: created.expiresAt,
            },
          )?.newValue,
        },
        tx,
      );
      // The only point in this key's lifecycle where the plaintext exists.
      return { ...created, key: generated.plaintext };
    });
  }

  async revoke(
    agentId: string,
    keyId: string,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    await this.assertAgentExists(agentId);
    const existing = await this.prisma.apiKey.findFirst({
      where: { id: keyId, actorId: agentId },
      select: KEY_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('API key not found');
    }
    if (existing.revokedAt) {
      return existing; // idempotent
    }
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.apiKey.update({
        where: { id: keyId },
        data: { revokedAt: new Date() },
        select: KEY_SELECT,
      });
      await this.audit.record(
        {
          projectId: null,
          actorId: requesterActorId,
          entityType: 'ApiKey',
          entityId: revoked.id,
          operation: 'API_KEY_REVOKE',
          origin,
          newValue: diffFields(
            { apiKeyId: revoked.id, revokedAt: null },
            { apiKeyId: revoked.id, revokedAt: revoked.revokedAt },
          )?.newValue,
        },
        tx,
      );
      return revoked;
    });
  }

  private async assertAgentExists(agentId: string) {
    const agent = await this.prisma.actor.findFirst({
      where: { id: agentId, kind: 'AI_AGENT' },
      select: { id: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
  }
}
