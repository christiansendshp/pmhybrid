import { Injectable } from '@nestjs/common';
import { AuditOrigin, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';

export interface AuditRecord {
  /** Null only for an event about a global entity (e.g. an Actor). */
  projectId: string | null;
  actorId?: string | null;
  entityType: string;
  entityId: string;
  operation: string;
  origin: AuditOrigin;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

export interface FieldDiff {
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}

const DEFAULT_LIMIT = 50;

/**
 * The one write path for AuditEvent (brief §25). Callers pass their own
 * transaction client, so an audit row commits or rolls back together with
 * the mutation it describes — an @OnEvent listener runs outside that
 * transaction and could not guarantee it.
 *
 * Origin `UI` covers every authenticated REST call made on a person's
 * behalf; `API` stays reserved for agent API-key access (Roadmap GAP-15).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(entry: AuditRecord, client: Prisma.TransactionClient = this.prisma) {
    return client.auditEvent.create({
      data: {
        projectId: entry.projectId,
        actorId: entry.actorId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId,
        operation: entry.operation,
        origin: entry.origin,
        previousValue: toJson(entry.previousValue),
        newValue: toJson(entry.newValue),
      },
    });
  }

  /**
   * Conflicts are first-class rows (brief §26); this is their trail entry.
   * Never pass origin `UI` here — sync's per-field conflict check treats
   * every UI-origin newValue key as a locally edited field.
   */
  recordConflictDetected(
    conflict: {
      id: string;
      projectId: string;
      kind: string;
      entityType: string;
      entityId: string;
    },
    origin: Exclude<AuditOrigin, 'UI'>,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    return this.record(
      {
        projectId: conflict.projectId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        operation: 'CONFLICT_DETECTED',
        origin,
        newValue: { conflictId: conflict.id, kind: conflict.kind },
      },
      client,
    );
  }

  findForProject(projectId: string, query: AuditQueryDto) {
    return this.prisma.auditEvent.findMany({
      where: {
        projectId,
        entityType: query.entityType,
        entityId: query.entityId,
        operation: query.operation,
        origin: query.origin,
      },
      // id breaks timestamp ties so cursor paging is stable.
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit ?? DEFAULT_LIMIT,
      include: {
        actor: { select: { id: true, displayName: true, kind: true } },
      },
    });
  }
}

/**
 * The scalar/date fields of `after` whose value differs from `before`, or
 * null if none do (`undefined` in `after` means "not provided"). Sync's
 * per-field conflict check (docs/synchronization.md step 5) reads these key
 * names, so an unchanged field must never appear in newValue.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff | null {
  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(after)) {
    if (value === undefined) {
      continue;
    }
    const from = normalize(before[field]);
    const to = normalize(value);
    if (from !== to) {
      previousValue[field] = from;
      newValue[field] = to;
    }
  }
  return Object.keys(newValue).length > 0 ? { previousValue, newValue } : null;
}

function normalize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

function toJson(value: Record<string, unknown> | null | undefined) {
  return (value ?? undefined) as Prisma.InputJsonValue | undefined;
}
