import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Subscribes to domain events (docs/architecture.md). MVP ships internal notifications only (brief §29). */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAllForActor(actorId: string) {
    return this.prisma.notification.findMany({ where: { actorId } });
  }

  @OnEvent('sync.conflict.detected')
  handleConflictDetected(payload: unknown): void {
    this.logger.debug(`sync.conflict.detected: ${JSON.stringify(payload)}`);
  }
}
