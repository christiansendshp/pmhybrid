import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

interface SyncCompletedPayload {
  projectId: string;
  syncRunId: string;
  conflictsRaised: number;
}

interface SyncFailedPayload {
  projectId: string;
  syncRunId: string;
  trigger: string;
  error: string;
}

/**
 * Subscribes to domain events (docs/architecture.md "side effects that may
 * lag... hang off event-emitter events, without touching business logic").
 * MVP ships internal notifications only (brief §29) — no push, the UI polls
 * on demand.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    await this.notifyProjectMembers(payload.projectId, 'CONFLICTS_DETECTED', {
      syncRunId: payload.syncRunId,
      conflictsRaised: payload.conflictsRaised,
    });
  }

  @OnEvent('sync.failed')
  async handleSyncFailed(payload: SyncFailedPayload): Promise<void> {
    await this.notifyProjectMembers(payload.projectId, 'SYNC_FAILED', {
      syncRunId: payload.syncRunId,
      trigger: payload.trigger,
      error: payload.error,
    });
  }

  private async notifyProjectMembers(
    projectId: string,
    type: string,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      const members = await this.prisma.projectMember.findMany({
        where: { projectId, isActive: true, actor: { isActive: true } },
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
      // Best-effort side channel — never let a notification failure look
      // like the sync itself failed.
      this.logger.error(
        `Failed to create ${type} notifications for project ${projectId}: ${String(error)}`,
      );
    }
  }
}
