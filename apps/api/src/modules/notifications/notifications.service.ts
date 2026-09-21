import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsGateway } from '../realtime/notifications.gateway.js';

interface SyncCompletedPayload {
  projectId: string;
  syncRunId: string;
  conflictsRaised: number;
  /** Roadmap entries sync could not read — only when that set changed since the previous run (Roadmap BUG-05). */
  entryErrors?: { id: string; reason: string }[];
  /** Undefined for a SCHEDULED run — nobody to exclude. */
  requesterActorId?: string;
}

interface SyncFailedPayload {
  projectId: string;
  syncRunId: string;
  trigger: string;
  error: string;
  requesterActorId?: string;
}

/**
 * Subscribes to domain events (docs/architecture.md "side effects that may
 * lag... hang off event-emitter events, without touching business logic").
 * Pushed live over `NotificationsGateway` when the recipient has an open
 * socket (Roadmap GAP-26); the REST list stays authoritative either way, so
 * a client that never connects (or missed the push) still sees it next poll.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  findAllForActor(actorId: string) {
    return this.prisma.notification.findMany({
      where: { actorId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Idempotent, and scoped to the caller's own notifications — 404 rather than leaking whether another actor's id exists. */
  async markRead(id: string, actorId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.actorId !== actorId) {
      throw new NotFoundException('No such notification');
    }
    if (notification.readAt) {
      return notification;
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** One notification per conflict-raising sync run — not per conflict, so a member sees "3 conflicts" once rather than 3 separate rows. Likewise one per *change* in the set of unreadable Roadmap entries. */
  @OnEvent('sync.completed')
  async handleSyncCompleted(payload: SyncCompletedPayload): Promise<void> {
    if (payload.conflictsRaised > 0) {
      await this.notifyProjectMembers(
        payload.projectId,
        'CONFLICTS_DETECTED',
        {
          syncRunId: payload.syncRunId,
          conflictsRaised: payload.conflictsRaised,
        },
        payload.requesterActorId,
      );
    }
    const entryErrors = payload.entryErrors ?? [];
    if (entryErrors.length > 0) {
      await this.notifyProjectMembers(
        payload.projectId,
        'ROADMAP_ENTRIES_INVALID',
        {
          syncRunId: payload.syncRunId,
          count: entryErrors.length,
          // A few are enough to know where to look; the sync run lists them all.
          entries: entryErrors
            .slice(0, 5)
            .map(({ id, reason }) => ({ id, reason })),
        },
        payload.requesterActorId,
      );
    }
  }

  @OnEvent('sync.failed')
  async handleSyncFailed(payload: SyncFailedPayload): Promise<void> {
    await this.notifyProjectMembers(
      payload.projectId,
      'SYNC_FAILED',
      {
        syncRunId: payload.syncRunId,
        trigger: payload.trigger,
        error: payload.error,
      },
      payload.requesterActorId,
    );
  }

  /** Never notifies whoever directly triggered this run — a manual "Sync now" already returned its own result in the response. */
  private async notifyProjectMembers(
    projectId: string,
    type: string,
    payload: Prisma.InputJsonValue,
    excludeActorId?: string,
  ): Promise<void> {
    let members: { actorId: string }[];
    try {
      members = await this.prisma.projectMember.findMany({
        where: {
          projectId,
          isActive: true,
          actor: { isActive: true },
          ...(excludeActorId ? { actorId: { not: excludeActorId } } : {}),
        },
        select: { actorId: true },
      });
      if (members.length === 0) {
        return;
      }
      await this.prisma.notification.createMany({
        data: members.map((m) => ({
          actorId: m.actorId,
          projectId,
          type,
          payload,
        })),
      });
    } catch (error) {
      this.logger.error(
        `Failed to create ${type} notifications for project ${projectId}: ${String(error)}`,
      );
      return;
    }

    // Isolated from the persistence try/catch above: a push failure (dead
    // socket, actor lookup hiccup) must never be logged as if the
    // notifications themselves failed to save — they didn't.
    await Promise.all(
      members.map((m) =>
        this.gateway
          .pushToActor(m.actorId, { type: 'notifications.changed' })
          .catch((error: unknown) => {
            this.logger.error(
              `Failed to push realtime notification to actor ${m.actorId}: ${String(error)}`,
            );
          }),
      ),
    );
  }
}
