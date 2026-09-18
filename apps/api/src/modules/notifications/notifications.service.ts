import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsGateway } from '../realtime/notifications.gateway.js';

interface SyncCompletedPayload {
  projectId: string;
  syncRunId: string;
  conflictsRaised: number;
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

  /** One notification per conflict-raising sync run — not per conflict, so a member sees "3 conflicts" once rather than 3 separate rows. */
  @OnEvent('sync.completed')
  async handleSyncCompleted(payload: SyncCompletedPayload): Promise<void> {
    if (payload.conflictsRaised === 0) {
      return;
    }
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
    try {
      const members = await this.prisma.projectMember.findMany({
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
      await Promise.all(
        members.map((m) =>
          this.gateway.pushToActor(m.actorId, {
            type: 'notifications.changed',
          }),
        ),
      );
    } catch (error) {
      // Best-effort side channel — never let a notification failure look
      // like the sync itself failed.
      this.logger.error(
        `Failed to create ${type} notifications for project ${projectId}: ${String(error)}`,
      );
    }
  }
}
